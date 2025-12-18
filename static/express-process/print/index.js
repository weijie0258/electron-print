/*
 * @Description:
 * @Date: 2022-01-11 17:54:26
 * @LastEditTime: 2023-06-06 16:34:15
 */
const download = require("download");
// const path = require('path')
const fse = require("fs-extra");
const fs = require("fs");
const dayjs = require("dayjs");
const { print } = require("pdf-to-printer");
const pdf = require("pdf-parse");

let uid = 0; // 标识 id

/**
 * download 的默认 options 选项
 */
const defaultDownloadOptions = {
  rejectUnauthorized: false,
  timeout: 10 * 1000, // 默认 10秒 超时时间限制
};

/**
 * 下载文件到缓存目录
 * @param {String} url - 文件 http 地址
 * @param {String} cacheDir - 缓存目录地址
 * @param {object} options- download 下载时的 options 选项
 *
 * @returns {Promise} {filename} 文件名
 */
async function downloadFile(url, cacheDir, options) {
  // options 可以参考 https://github.com/sindresorhus/got/blob/main/source/core/options.ts

  // 可以通过以下设置来控制证书验证行为
  // options = {
  //   rejectUnauthorized: false
  // }

  try {
    const mergeOptions = Object.assign({}, defaultDownloadOptions, options);

    // 增加资源获取失败提示
    const response = await download(url, cacheDir, mergeOptions);

    const { filename, fileType } = getFilename(cacheDir);

    // WARM: 如果没有文件后缀, 则这里断定为非正常的资源链接, 会读取 buffer 信息返回
    if (fileType === "") throw Error(`${response.toString()}`);

    return { filename, fileType };
  } catch (err) {
    console.log(err);

    throw Error(handleDownloadError(err));
  }
}

/**
 * 删除缓存文件
 * @param {String} cacheDir - 缓存目录路径
 * @param {String} filename - 文件名 (可选)
 */
async function deleteCache(cacheDir, filename) {
  const filePath = filename ? `${cacheDir}\\${filename}` : cacheDir;

  fse.remove(filePath, (err) => {
    if (err) return console.error(err);
    // console.log('delete success')
  });
}

/**
 * 打印 pdf 文件
 * @param {String} cacheDir - 缓存目录路径
 * @param {String} filename - 文件名
 * @param {String} deviceName - 打印机名称
 * @param {object} downloadOptions - 打印配置
 * @returns {Promise}
 */
async function printPdf(cacheDir, filename, deviceName, downloadOptions) {
  console.log("-----打印文件名称------" + filename);
  // 根据打印文件名设置票据与清单的横纵向
  console.log(
    "横纵向(portrait 纵向 landscape 横向):" +
      downloadOptions.orientation +
      " 打印机型号:" +
      downloadOptions.printer +
      " 页码:" +
      downloadOptions.pages +
      " 纸张类型:" +
      downloadOptions.paperSize
  );
  // 打印配置项
  const options = {
    // portrait 纵向 landscape 横向
    orientation: downloadOptions.orientation,
    // 打印机型号
    printer: downloadOptions.printer,
    // 页码
    pages: downloadOptions.pages,
    // 纸张类型
    paperSize: downloadOptions.paperSize,
    scale: "fit", //  Supported names noscale, shrink and fit.
    monochrome: false, // 默认打印黑白,黑白打印 true、false
    silent: false, // 屏蔽打印错误的信息
  };
  const pdfPath = `${cacheDir}\\${filename}`;
  return print(pdfPath, options).then(() => {
    return Promise.resolve(true);
  });
}

function queryFileType(fullFilename) {
  const files = fullFilename.split(".");

  // 如果没有文件后缀, 则返回 ''
  return files.length === 1 ? "" : files[files.length - 1];
}

/**
 * 获取文件名
 * @param {String} cacheDir -缓存目录对应的文件夹下的对应文件夹
 * @returns {String} 文件名
 */
function getFilename(cacheDir) {
  const filenames = fs.readdirSync(cacheDir);
  if (filenames.length === 1) {
    return { filename: filenames[0], fileType: queryFileType(filenames[0]) };
  } else {
    throw new Error("文件不存在或文件夹内容异常");
  }
}

/**
 * 创建随机文件夹名字 - 防止文件相同导致覆盖 - 从而导致打印文件丢失或者不准确的问题
 * @param {String} cacheDir - 缓存文件夹
 * @returns {String} 文件夹名字
 */
function wrapRandomFolder(cacheDir) {
  const foldername = `${dayjs().valueOf()}_${uid}`;
  uid++;

  cacheDir += "\\" + foldername;

  return cacheDir;
}

/**
 * 打印图片
 * @param {String} cacheDir - 缓存目录路径
 * @param {String} filename - 文件名
 * @param {String} deviceName - 打印机名称
 * @param {string} fileUrl - 图片地址
 */
function printImage(cacheDir, filename, deviceName, fileUrl) {
  const filePath = `${cacheDir}\\${filename}`;
  return new Promise((resolve, reject) => {
    process.once("message", (res) => {
      const { type, err } = res;

      switch (type) {
        case "print-image-success":
          resolve();
          console.log("打印完成了, 这是子进程的消息", res);

          break;
        case "print-image-failed":
          reject(err);
          break;

        default:
          break;
      }
    });
    process.send({ type: "print-image", result: { deviceName, filePath } });
  });
}

/**
 * 对文件下载失败做分类提示
 * @param {Object} err - 异常错误
 * @returns {string} 文字提示
 */
function handleDownloadError(err) {
  const errInfo = err.toString();
  // 附加提示
  let additionalTips = "";

  if (errInfo.includes("timed out")) {
    additionalTips = "文件下载超时, 请检查文件链接是否正确";
  }

  return additionalTips ? `"${additionalTips}" ${errInfo}` : err;
}

/**
 * 获取 PDF 文件的页数
 * @param {String} pdfPath - PDF文件路径
 * @returns {Promise<number>} PDF总页数
 */
async function getPdfPageCount(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    console.log("PDF页数:", data.numpages);
    return data.numpages;
  } catch (err) {
    console.error("获取PDF页数失败:", err);
    return 0;
  }
}

// /**
//  * 处理下载的资源url内容如果是未授权时 (即下载的不是正常的文件时, 需要作出提示)
//  */
// function handleDownloadUnauthorized() {}

exports.printImage = printImage;
exports.downloadFile = downloadFile;
exports.deleteCache = deleteCache;
exports.printPdf = printPdf;
exports.getFilename = getFilename;
exports.wrapRandomFolder = wrapRandomFolder;
exports.getPdfPageCount = getPdfPageCount;
