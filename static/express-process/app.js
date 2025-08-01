/* eslint-disable no-unused-vars */
/*
 * @Description: express 单个打印服务
 * @Date: 2022-01-10 17:29:37
 * @LastEditTime: 2023-06-08 10:27:38
 */
const express = require("express");
const log = require("electron-log");
const bodyParser = require("body-parser");
const PrintScheduler = require("./print/scheduler.js");
const { handleFileType } = require("./print/file-type");
const Base64 = require("js-base64").Base64;

// 在子进程中捕获异常并输出错误信息到控制台
process.on("uncaughtException", (err) => {
  console.error(
    ` =============== Caught exception: ${err.stack} =============== `
  );
});

const app = express();

const {
  downloadFile,
  printPdf,
  deleteCache,
  wrapRandomFolder,
  printImage,
} = require("./print/index.js");

const [, , __static, httpPort = 45656, socketPort, cacheDir, deviceName] =
  process.argv;
console.log(__static, httpPort, socketPort, cacheDir, deviceName);

// NOTE: 打印队列实例
const printScheduler = new PrintScheduler(handlePrint);

// eslint-disable-next-line no-constant-condition
if (10 > 11) {
  console.log(socketPort, deviceName);
  console.log(printPdf);
}

let fileUid = 0; // 每个文件打印的 id 标识 (唯一, 会递增)
let multipleQueueIndex = 0; // 同一个打印队列的 id 标识 (唯一, 会递增)

// 允许跨域
app.all("*", (req, res, next) => {
  // res.header("Access-Control-Allow-Origin", '*');
  res.header("Access-Control-Allow-Origin", req.headers.origin);
  res.header("Access-Control-Allow-Private-Network", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type,Content-Length, Authorization, Accept,X-Requested-With"
  );
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("X-Powered-By", " 3.2.1");
  if (req.method === "OPTIONS") res.send(200); /* 让options请求快速返回 */
  else next();
});

// NOTE: 在路由处理程序之前添加 body-parser 中间件
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send({
    code: "200",
    message: "express-print",
  });
});

/**
 * 预览文件 (只能单个预览)
 */
app.get("/preview", (req, res) => {
  const { fileUrl } = req.query;
  console.log("preview - ", fileUrl);

  if (!fileUrl) res.send({ code: "400", message: "fileUrl不能为空" });
  else {
    // 通知父进程, 然后通过  EventEmitter 来触发 file-preview.js 中的创建窗口预览
    process.send({ type: "preview-file", result: fileUrl });
    res.send(204);
  }
});

/**
 * 多个打印
 * NOTE: 用 ; 隔开
 * 事例: localhost:45656/print?fileUrl=http://xxxx;http://zzzzzz;http://yyyyy
 */
app.post("/multiple-print", (req, res) => {
  try {
    const { fileUrl } = req.query;
    const urls = fileUrl.split(";");
    const wrapUrls = urls.map((url) => {
      const printInfo = createPrintInfo(url, false);
      return printInfo;
    });

    const startUid = wrapUrls[0].__fileUid__; // 该段队列的起始点 fileUid
    const endUid = wrapUrls[wrapUrls.length - 1].__fileUid__; // 该段队列的结束点 fileUid

    const printCallback = (status, data) => {
      let respondData = {};
      if (status === 1) {
        respondData = {
          code: "200",
          data,
          message: `打印完成`,
        };
      }
      res.send(respondData);
    };

    wrapUrls.forEach((element, index) => {
      // ==========
      element.start = startUid;
      element.end = endUid;
      element.__multipleId__ = multipleQueueIndex; // 每个批量的队列都有自己的 id 标识
      // ==========

      printScheduler.insert(element, printCallback);

      // 该条多个打印队列中添加回调
      if (wrapUrls.length - 1 === index) {
        element.successCallback = printCallback; // 将队列最后一个成员添加 callback
      }
    });

    multipleQueueIndex++;
  } catch (e) {
    res.send({
      code: "400",
      message: e + "",
    });
  }
});

/**
 * 单个打印服务
 * NOTE: 需要创建打印队列, 因为打印机只能一份一份打印
 *
 * 事例: localhost:45656/print?fileUrl=http://xxxx
 */
app.post("/print", (req, res, next) => {
  console.log("-------------------------------------------print");
  /**
   * NOTE:
   * 实现步骤:
   * 1. 在目标缓存目录下继续创建随机文件夹(目的防止文件重名覆盖或重命名)
   * 2. 通过步骤 1 在目标文件夹下下载文件
   * 3. 下载完成后打印对应的 pdf 文件
   * 4. 打印完删除对应的随机文件夹 (不是删除文件)
   */
  const { fileUrl: fileUrlInUrl } = req.query;

  // WARM: 当前版本设计, fileUrl 先不从 url 中移到 body(保留在 url 中) , 因为这个调用属于破坏性更新, 将影响之前版本的调阅方法
  // 目前才用合并处理, 如果 url 中存在 fileUrl 中的话, 就采用请求 url 中的 fileUrl (反之取 body 中的)

  const { fileUrl: fileUrlInBody } = req.body;

  const fileUrl = fileUrlInUrl || fileUrlInBody;

  console.log("原始地址: ", fileUrl);

  let downloadOptions = JSON.parse(Base64.decode(fileUrl));

  let respondData = {};
  if (fileUrl) {
    if (downloadOptions.pages == "1-999") {
      let downloadOptionsBill = { ...downloadOptions, pages: "1-1" };
      let downloadOptionsList = {
        ...downloadOptions,
        orientation: downloadOptions.orientationList,
        paperSize: downloadOptions.paperSizeList,
        pages: "2-99",
      };
      console.log("同时打印", downloadOptionsBill, downloadOptionsList);
      const printInfo1 = createPrintInfo(
        downloadOptions.url,
        true,
        downloadOptionsBill
      );
      const printInfo2 = createPrintInfo(
        downloadOptions.url,
        true,
        downloadOptionsList
      );
      let billFlag = false;
      let listFlag = false;
      const printCallback1 = (status = 1, e) => {
        // 成功
        if (status === 1) {
          billFlag = true;
        }
      };
      const printCallback2 = (status = 1, e) => {
        // 成功
        if (status === 1) {
          listFlag = true;
          // 全部打印完成
          if (billFlag && listFlag) {
            respondData = {
              code: "200",
              message: `打印完成`,
            };
          }
          // 清单打印成功 票据失败
          if (billFlag == false && listFlag) {
            respondData = {
              code: "200",
              message: `清单打印完成, 票据异常`,
            };
          }
        } else {
          if (billFlag) {
            respondData = {
              code: "200",
              message: `票据打印完成, 清单异常`,
            };
          } else {
            respondData = {
              code: "500",
              message: `${e}`,
            };
          }
        }
        res.send(respondData);
      };
      printScheduler.insert(printInfo1, printCallback1);
      printScheduler.insert(printInfo2, printCallback2);
    } else {
      console.log("downloadOptions", downloadOptions);
      const printInfo = createPrintInfo(
        downloadOptions.url,
        true,
        downloadOptions
      );

      const printCallback = (status = 1, e) => {
        // 成功
        if (status === 1) {
          respondData = {
            code: "200",
            message: `打印完成`,
          };
        } else {
          respondData = {
            code: "500",
            message: `${e}`,
          };
        }

        res.send(respondData);
      };

      printScheduler.insert(printInfo, printCallback);
    }
  } else {
    respondData = {
      code: "400",
      message: "fileUrl不能为空",
    };
    res.send(respondData);
  }

  // next()
});

/**
 * 创建打印任务信息
 * @param {String} fileUrl - 文件地址
 * @param {Boolean} isSingle - 是否单个打印
 * @param {object} downloadOptions - download 下载库的 options 选项
 *
 * @returns {Object}
 */
function createPrintInfo(fileUrl, isSingle = true, downloadOptions = {}) {
  if (!fileUrl) throw new Error("fileUrl不能为空");
  const printInfo = {
    cacheDir,
    fileUrl,
    __fileUid__: fileUid,
    isSingle,
    downloadOptions,
  };
  fileUid++;

  return printInfo;
}

/**
 * 处理打印任务
 * @returns {Promise} { status:Boolean, ?error:String }
 */
async function handlePrint({ fileUrl, downloadOptions }) {
  /**
   * 是否打印成功
   */
  let status = false;

  /**
   * 打印失败时的错误信息
   */
  let error = "";

  /**
   * 包装一下文件夹 - 让它变成随机的
   */
  let randomCacheDir = "";

  /**
   * 真实文件名
   */
  let realFilename = "";

  try {
    randomCacheDir = wrapRandomFolder(cacheDir);

    console.log("开始下载文件" + downloadOptions.url);

    // 文件下载地址替换为json中的url
    fileUrl = downloadOptions.url;
    // 下载文件至本地的缓存文件夹
    const { filename, fileType } = await downloadFile(
      fileUrl,
      randomCacheDir,
      downloadOptions
    );

    // // 没有文件后缀的, 要处理, 因为这有可能涉及到资源权限, 有的资源可能做了 授权, 防盗链 等处理。可能是个 http 请求
    // if (fileType) {}

    realFilename = filename;

    // NOTE: 正式打印 ========== ↓
    await dispatchByFileType(
      handleFileType(fileType),
      filename,
      randomCacheDir,
      fileUrl,
      downloadOptions
    );
    // NOTE: 正式打印 ========== ↑

    status = true;
  } catch (e) {
    console.log(e, "\n--------------------");

    status = false;
    error = (e?.message || e) + "";
  } finally {
    // 无论是否打印成功, 都删除已下载的文件(直接删除文件夹)
    deleteCache(randomCacheDir);

    const result = `是否打印成功: ${status ? "是" : "否"}`;

    console.log(`===== ${result}`, realFilename, "=====");

    log.warn(`资源链接: ${fileUrl} \n${result} \n文件名:${realFilename}`);
  }

  return { status, error };
}

/**
 * 根据不同的文件来处理打印
 * 依据 handleFileType 的返回值
 * @param {string} fileDetail - 文件具体类型
 * @param {string} filename - 文件夹
 * @param {string} randomCacheDir - 通过随机生成的文件夹名字
 * @param {string} fileUrl - 资源地址
 * @param {object} downloadOptions - 打印配置
 */
function dispatchByFileType(
  fileDetail,
  filename,
  randomCacheDir,
  fileUrl,
  downloadOptions
) {
  // 这一步, 使用 download 下载文件后, 需要看文件下载的内容是否支持打印
  // NOTE: 目的: 为了对不同的文件类型使用不同的打印方式进行分发处理

  switch (fileDetail) {
    case "image":
      // 打印图片

      return printImage(randomCacheDir, filename, deviceName);

    case "pdf":
      // 打印 pdf

      return printPdf(randomCacheDir, filename, deviceName, downloadOptions);

    default:
      // 未匹配

      throw Error("未支持打印该文件类型, 请检查链接资源是否正确且可以被访问");
  }
}

// 启动服务
app.listen(
  Number(httpPort),
  () => void console.log(`server open on ${Number(httpPort)}!`)
);
