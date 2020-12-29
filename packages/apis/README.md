# 网易云信 sdk 组件化 api 层

## 下载

1. 通过[链接](http://yx-web.nos.netease.com/package/1606273033/NERTCCalling.zip)下载组件。
2. 将下载后的组件解压，重命名后放入项目中
3. 添加到`eslintignore`或者`prettierignore`等忽略中，如没有可忽略这一步

## 引入

组件提供`es module`、`commonjs`、`umd`三种打包方式，可以根据你项目的情况按需引入其中的一种

**es module:**

```js
import { RTCCalling } from 'yourPath';
const rtc = new RTCCalling({
  debug: true, // 是否需要开启日志，默认开启
});
```

**commonjs:**

```js
const { RTCCalling } = require('yourPath');
const rtc = new RTCCalling({
  debug: true, // 是否需要开启日志，默认开启
});
```

**script 引入**

```html
<script src="/yourPath/assets/sdk/NIM_Web_SDK_v8.1.0.js"></script>
<script src="/yourPath/assets/sdk/NIM_Web_WebRTC2_v3.7.0.js"></script>
<script src="/yourPath/lib/index.umd.js"></script>
<script>
  var RTCCalling = window.NRTCCalling.RTCCalling;
  var rtc = new RTCCalling({
    debug: true, // 是否需要开启日志，默认开启
  });
</script>
```

## 快速使用

### 实时音视频通话组件

```js
(async () => {
  // 初始化G2
  rtc.setupAppKey({
    appKey: 'appKey',
  });

  // 登录信令sdk
  await rtc.login({
    account: 'account',
    token: '',
  });

  // 如果需要安全模式，需要手动调用设置token的函数
  // 请保证在发起呼叫和接受呼叫之前设置，且必须保证函数返回Promise
  rtc.setTokenService(async (uid) => {
    // 可以在此获取到uid
    // 自己的获取token逻辑
    const token = await api.getToken()
    return token
  })

  // 单呼
  const call = () => {
    rtc.call({
      userId: '', // 对方的account
      type: 2, // 1 音频 2 视频
    });
  };

  // 群呼
  const groupCall = () => {
    // 作为群呼的发起方，一般在此设置自己的视图
    const dom = document.getElementById(`local-stream`);
    rtc.setupLocalView(dom);
    rtc
      .groupCall({
        userIds: [], // 群呼的account数组
        type: 2, // 1 音频 2 视频
      })
      .then(() => {});
  };

  // 取消呼叫
  const cancel = () => {
    rtc.cancel();
  };

  // 接收呼叫
  const accept = () => {
    // 作为被动呼叫方，一般在此设置自己的视图
    const dom = document.getElementById(`local-stream`);
    rtc.setupLocalView(dom);
    rtc.accept().then(() => {});
  };

  // 拒绝呼叫
  const reject = () => {
    rtc.reject();
  };

  // 挂断
  const hangup = () => {
    rtc.hangup();
  };

  // 离开
  const leave = () => {
    rtc.leave();
  };

  // 注册事件监听
  // 收到邀请
  rtc.addDelegate('onInvited', () => {
    // 一般在此处唤起接听和拒绝按钮，点击后调用rtc.accept接收 或者 rtc.reject拒绝
  });

  // 对方取消呼叫
  rtc.addDelegate('onUserCancel', () => {
    // do sth
  });
  // 用户接受
  rtc.addDelegate('onUserAccept', (account) => {
    // 点对点呼叫一般在此设置本端视图
    const dom = document.getElementById(`local-stream`);
    rtc.setupLocalView(dom);
  });
  // 用户进入
  rtc.addDelegate('onUserEnter', (account) => {
    // 群呼一般在此设置远端用户的视图
    const div = document.getElementById(`remote-container-${account}`);
    rtc.setupRemoteView(account, div as HTMLElement)
  });
  // 用户拒绝
  rtc.addDelegate('onUserReject', (account) => {
    // do sth
  });
  // 用户离开
  rtc.addDelegate('onUserLeave', (account) => {
    // do sth
  });
  // 通话结束
  rtc.addDelegate('onCallEnd', () => {
    // do sth
  });
  // 收到远端视频流订阅变更
  rtc.addDelegate('onCameraAvailable', ({ userId: account, available }) => {
    // do sth
  });
  // 收到远端音频流订阅变更
  rtc.addDelegate('onAudioAvailable', ({ userId: account, available }) => {
    // do sth
  });
  // 错误监听
  rtc.addDelegate('onError', (error) => {
    // do sth
  });
})();
```
