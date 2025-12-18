<!--
 * @Description: 
 * @Date: 2022-04-14 15:28:56
 * @LastEditTime: 2022-07-11 16:34:14
-->

# electron 静默打印(桌面端)

支持直接传**PDF、图片的资源地址**到打印服务的接口中，完成打印😂。



## 解决问题

1. 前端可以直接调本地服务接口，将文件进行静默打印，不需要弹窗提示 ( 类似 window.print 的弹窗 )；
2. 直接传入**PDF、图片的资源地址**到打印服务接口中就可以打印；
3. 响应打印结果；
4. 打印进度队列与打印进度的提示；

## 已实现功能

 - [x] app 右下角托盘显示
 - [x] app 开机自启动(默认不显示主窗口)
 - [x] 屏幕右下角打印进度条提示
 - [x] 通过自定义协议打开/唤醒 app
 - [x] 单个打印、批量打印、打印预览

## 待实现功能

 - [ ] 适配MacOS打印
 - [ ] 打印前获取打印机状态(是否正常/脱机等等)


## 静默打印实现思路

1. 应用打开时默认启动  express 服务；
2. 前端调用应用启动的 express 服务接口，将文件路径作为参数传过去；
3. 应用接口收到内容后，包装一层数据，将其传进写好的打印队列调度器中进行打印任务处理；
4. 打印成功或失败会将内容从接口中返回到前端；

## 前端调用

> 演示详细请看 example/test-print.html

```javascript
// 应用默认启动 express 的端口为 45656

// 单个打印接口
const url = 'http://localhost:45656/print'
const fileUrl = 'http://xxxxxxxxx' // 文件地址
fetch(`${url}?fileUrl=${fileUrl}`, { method: 'POST' })
// 或
fetch(`${url}`, { method: 'POST', body: { fileUrl: fileUrl, downloadOptions: { xxx } } })

// 批量打印接口
const url = 'http://localhost:45656/multiple-print'
let fileUrls = ['http://aaaa', 'http://vvvv', 'http://dddd']
fileUrls = fileUrls.join(';') // 需要用 ';' 拼接起来
fetch(`${url}?fileUrl=${fileUrl}`, { method: 'POST' })

// 预览接口
const url = 'http://localhost:45656/preview'
const fileUrl = 'http://yyyyyyy'
fetch(`${url}?fileUrl=${fileUrl}`)
```


## 目前支持打印的文件类型

1. PDF (.pdf) **pdf打印目前仅支持windows平台**;
2. 图片 (.jpg .png .jpeg);

## 使用

```bash
# 安装
yarn install --ignore-engines

# 运行
yarn dev

## win32 打包
yarn build:win32

## win64 打包
yarn build
```

项目基于 [electron-vue](https://github.com/SimulatedGREG/electron-vue) 基础上开发, 使用的 electron 版本为 **11.2.1** 。

> 使用版本: node: 14.16.0 ,  npm: 6.14.11 , yarn: 1.22.10
> 
> >  [electron-vue中文指引](https://simulatedgreg.gitbooks.io/electron-vue/content/cn/)

## PDF打印过程

1. 将文件下载到本地缓存文件夹中( 使用 [download](https://github.com/kevva/download) );
2. 将下载好的本地文件打印 ( 使用 [pdf-to-printer](https://github.com/artiebits/pdf-to-printer) )；
3. 打印完成删除文件；

## 注意

1. 尚未对预留的 socket 内容进行开发，目前仅支持 http 请求;
2. 项目基于win平台开发，mac平台上部分功能未做兼容处理;



## 第三方包推荐

1. 日志调试 ( [electron-log](https://github.com/megahertz/electron-log) );
   electron-log 日志所在位置: 
   - **on Linux:** ~/.config/{app name}/logs/{process type}.log
   - **on macOS:** ~/Library/Logs/{app name}/{process type}.log
   - **on Windows:** %USERPROFILE%\AppData\Roaming{app name}\logs{process type}.log
2. 自动升级 ( electron-updater );
