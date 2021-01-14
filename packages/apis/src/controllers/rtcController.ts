import {
  RTCControllerTypes,
  CallType,
  SetupParams,
  Devices,
  DeviceItem,
  DeviceType,
  BaseOptions,
  StreamConfig,
  TokenService,
} from '../types/common';
import {
  CLIENT_NULL,
  UNKNOWN_ERROR,
  DEVICEID_NULL,
  STREAM_NULL,
} from '../constants/errors';
import BaseController from './baseController';
import WebRTC2 from '../../assets/sdk/NIM_Web_WebRTC2_v3.7.0';

class RTCController extends BaseController implements RTCControllerTypes {
  public client: any = null; // g2 sdk实例
  public webrtc: any = WebRTC2;
  public appKey = ''; // 当前实例的appKey
  private localStream: any = null; // 本地流
  private remoteStreams: any[] = []; // 远端流
  private localView: HTMLElement | undefined = undefined; // 本地视图
  private remoteViews: { view?: HTMLElement; uid: string }[] = []; // 远端视图
  private microphoneId = ''; // 麦克风
  private cameraId = ''; // 摄像头
  private speakerId = ''; // 扬声器
  private audioEnabled = false; // 音频是否激活
  private videoEnabled = false; // 视频是否激活
  private getTokenFunc: ((uid: string) => Promise<string>) | null = null; // 获取token的异步函数
  private resolution: SetupParams['resolution'] = 8; // 视频分辨率
  private frameRate: SetupParams['frameRate'] = 3; // 视频帧率
  private quality: SetupParams['quality'] = 'speech_low_quality'; // 音频质量

  constructor(options: BaseOptions) {
    super(options);
  }

  /**
   * 初始化G2
   * @param params
   */
  public setupAppKey({
    appKey,
    resolution,
    frameRate,
    quality,
  }: SetupParams): void {
    if (this.client) {
      return;
    }
    this.appKey = appKey;
    // 初始化client
    this.client = WebRTC2.createClient({
      appkey: this.appKey,
      debug: this.debug,
    });
    if (resolution) {
      this.resolution = resolution;
    }
    if (frameRate) {
      this.frameRate = frameRate;
    }
    if (quality) {
      this.quality = quality;
    }
    this.log('setupAppKey success');
  }

  /**
   * 设置获取token的异步函数，在加入RTC之前调用
   * @param cb 获取token的异步函数
   */
  public setTokenService(cb: TokenService): void {
    this.getTokenFunc = cb;
  }

  /**
   * 设置自己画面，在播放之前调用
   * @param view 位于的DOM节点
   */
  public setupLocalView(view?: HTMLElement): void {
    if (view) {
      this.localView = view;
      this.log('setupLocalView set view success', view);
    }
    // if (this.localStreamInit) {
    //   try {
    //     if (!this.localStream) {
    //       throw STREAM_NULL;
    //     }
    //     await this.startStreamPreview(this.localStream, view);
    //     this.log('setupLocalView preview success', this.localStream, view);
    //   } catch (error) {
    //     this.log('setupLocalView preview fail: ', this.localStream, view);
    //     return Promise.reject(error);
    //   }
    // }
  }

  /**
   * 设置其他用户画面，在播放之前调用
   * @param uid
   * @param view 位于的DOM节点
   */
  public setupRemoteView(uid: string, view?: HTMLElement): void {
    if (this.remoteViews.every((item) => item.uid !== uid)) {
      this.remoteViews.push({ uid, view });
    } else {
      this.remoteViews = this.remoteViews.map((item) =>
        item.uid === uid ? { ...item, view } : { ...item }
      );
    }
  }

  /**
   * 选择扬声器
   * @param deviceId 设备id
   */
  public async selectSpeakers(deviceId: string): Promise<void> {
    try {
      if (!this.client) {
        throw CLIENT_NULL;
      }
      const map = this.client.adapterRef?.audioHelperMap;
      if (!map) {
        throw UNKNOWN_ERROR;
      }
      if (!deviceId) {
        throw DEVICEID_NULL;
      }
      for (const item in map) {
        if (
          map[item] &&
          map[item].audioDomHelper &&
          map[item].audioDomHelper.audioDom
        ) {
          await this._selectSpeakers(
            map[item].audioDomHelper.audioDom,
            deviceId
          );
        }
      }
      this.log('selectSpeakers success', deviceId);
    } catch (error) {
      this.log('selectSpeakers fail: ', error, deviceId);
      return Promise.reject(error);
    }
  }

  /**
   * 获取设备列表
   */
  public async getDevices(): Promise<Devices> {
    try {
      const deviceMap = await WebRTC2.getDevices();
      const keyMap: { [key in keyof Devices]: DeviceType } = {
        audioIn: 'microphoneId',
        audioOut: 'speakerId',
        video: 'cameraId',
      };
      const res = {} as Devices;
      for (const key in deviceMap) {
        if (deviceMap.hasOwnProperty(key)) {
          res[key] = deviceMap[key].map((item: DeviceItem) => {
            if (this[keyMap[key]] === item.deviceId) {
              return { ...item, active: true };
            }
            return { ...item };
          });
        }
      }
      this.log('getDevices success', res);
      return res;
    } catch (error) {
      this.log('getDevices fail: ', error);
      return Promise.reject(error);
    }
  }

  /**
   * 切换设备
   * @param type 设备类型
   * @param deviceId 设备id
   */
  public async switchDevice(type: DeviceType, deviceId: string): Promise<void> {
    try {
      switch (type) {
        case 'microphoneId':
          if (this.microphoneId === deviceId) {
            return Promise.resolve();
          }
          // await this._muteLocalAudio(false);
          await this.muteLocalAudio(this.audioEnabled, deviceId);
          break;
        case 'cameraId':
          if (this.cameraId === deviceId) {
            return Promise.resolve();
          }
          // await this._enableLocalVideo(false);
          await this.enableLocalVideo(this.videoEnabled, deviceId);
          break;
        case 'speakerId':
          if (this.speakerId === deviceId) {
            return Promise.resolve();
          }
          await this.selectSpeakers(deviceId);
          break;
      }
      this.log('switchDevice success', type, deviceId);
    } catch (error) {
      this.log('switchDevice fail: ', error, type, deviceId);
      return Promise.reject(error);
    }
  }

  /**
   * 设置远端音频静音
   * @param mute true 关闭 false 开启
   * @param uid
   */
  public async setAudioMute(mute: boolean, uid: string): Promise<void> {
    const stream = this.remoteStreams.find((item) => item.getId() === uid);
    if (!stream) {
      this.log('setAudioMute fail: ', STREAM_NULL, uid);
      return Promise.reject(STREAM_NULL);
    }
    try {
      if (mute) {
        await stream.muteAudio();
        // await this.rtcUnSubscribe(stream, { audio: false, video: true });
      } else {
        await stream.unmuteAudio();
        // await this.rtcSubscribe(stream, { audio: true, video: true });
      }
      this.log('setAudioMute success', mute, stream);
    } catch (error) {
      this.log('setAudioMute fail: ', error);
      return Promise.reject(error);
    }
  }

  /**
   * 本端加入G2的房间
   * 创建本地流并初始化本地流
   * 发布本地流
   * @param param
   */
  public async joinRTCChannel({
    channelName,
    type,
    uid,
  }: {
    channelName: string;
    type: CallType;
    uid: string;
  }): Promise<void> {
    try {
      if (!this.client) {
        throw CLIENT_NULL;
      }
      let token = '';
      if (this.getTokenFunc) {
        token = await this.getTokenFunc(uid);
        this.log('getToken success', token);
      }
      await this.client.join({
        channelName,
        uid,
        token,
      });
      await this.initLocalStream({
        type,
        uid,
      });
      // 发布本地媒体给房间对端
      await this.client.publish(this.localStream);
      this.log('joinRTCChannel success');
    } catch (error) {
      this.log('joinRTCChannel fail:', error);
      return Promise.reject(error);
    }
  }

  /**
   * 初始化本地流
   * @param param
   */
  public async initLocalStream({
    type,
    uid,
  }: {
    type: CallType;
    uid: string;
  }): Promise<void> {
    try {
      this.localStream = WebRTC2.createStream({
        uid,
        audio: true,
        video: type === 2,
        screen: false,
      });
      this.log('localStream create success');

      // 设置本地视频质量
      this.localStream.setVideoProfile({
        resolution: this.resolution, //设置视频分辨率
        frameRate: this.frameRate, //设置视频帧率
      });
      // 设置本地音频质量
      this.localStream.setAudioProfile(this.quality);
      // 启动媒体，打开实例对象中设置的媒体设备
      await this.localStream.init();
      // this.localStreamInit = true;
      this.log('localStream init success');
      // 指定默认设备，需要在init之后调用
      const { audioIn, audioOut, video } = await this.getDevices();
      this.microphoneId = audioIn[0]?.deviceId || '';
      this.cameraId = video[0]?.deviceId || '';
      this.speakerId = audioOut[0]?.deviceId || '';
      await this.startStreamPreview(this.localStream, 'local', this.localView);
      this.log(
        'startLocalStreamPreview success',
        this.localStream,
        this.localView
      );
      this.log('initLocalStream success');
    } catch (error) {
      this.log('initLocalStream fail:', error);
      return Promise.reject(error);
    }
  }

  /**
   * 订阅G2流
   * @param stream
   */
  public async rtcSubscribe(stream: any, config: StreamConfig): Promise<void> {
    stream.setSubscribeConfig(config);
    try {
      if (!this.client) {
        throw CLIENT_NULL;
      }
      await this.client.subscribe(stream);
      this.log('rtcSubscribe success');
    } catch (error) {
      this.log('rtcSubscribe fail:', error);
      return Promise.reject(error);
    }
  }

  /**
   * 取消订阅G2流
   * @param stream
   * @param config
   */
  public async rtcUnSubscribe(
    stream: any,
    config: StreamConfig
  ): Promise<void> {
    stream.setSubscribeConfig(config);
    try {
      if (!this.client) {
        throw CLIENT_NULL;
      }
      await this.client.unsubscribe(stream);
      this.log('rtcUnSubscribe success');
    } catch (error) {
      this.log('rtcUnSubscribe fail:', error);
      return Promise.reject(error);
    }
  }

  /**
   * 离开G2房间
   */
  public async rtcLeave(): Promise<void> {
    try {
      if (!this.client) {
        throw CLIENT_NULL;
      }
      await this.client.leave();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * 播放流
   * @param stream
   * @param type
   * @param view
   */
  public async startStreamPreview(
    stream: any,
    type: 'local' | 'remote',
    view?: HTMLElement
  ): Promise<void> {
    try {
      await stream.play(view);
      this.log('startStreamPreview success', { stream, type, view });
      // todo sdk bug 再次调该接口视图会变
      if (view) {
        const params = {
          // 设置视频窗口大小
          width: view.clientWidth,
          height: view.clientHeight,
          cut: true, // 是否裁剪
        };
        stream[type === 'local' ? 'setLocalRenderMode' : 'setRemoteRenderMode'](
          params
        );
        this.log('setLocalRenderMode success', { params, type });
      }
    } catch (error) {
      this.log('startStreamPreview fail: ', error);
      return Promise.reject(error);
    }
  }

  /**
   * 开启/关闭摄像头
   * @param enabled true 打开 false 关闭
   * @param deviceId [可选] 设备id
   */
  public async enableLocalVideo(
    enabled: boolean,
    deviceId?: string
  ): Promise<void> {
    try {
      if (!this.localStream) {
        throw STREAM_NULL;
      }
      await this.localStream[enabled ? 'open' : 'close']({
        type: 'video',
        deviceId,
      });
      this.videoEnabled = enabled;
      if (deviceId) {
        this.cameraId = deviceId;
      }
      if (enabled) {
        await this.startStreamPreview(
          this.localStream,
          'local',
          this.localView
        );
      }
      this.log('_enableLocalVideo success:', enabled, deviceId);
    } catch (error) {
      this.log('_enableLocalVideo fail:', enabled, deviceId, error);
      return Promise.reject(error);
    }
  }

  /**
   * 开启/关闭麦克风
   * @param mute true 关闭 false 开启
   * @param deviceId [可选] 设备id
   */
  public async muteLocalAudio(mute: boolean, deviceId?: string): Promise<void> {
    try {
      if (!this.localStream) {
        throw STREAM_NULL;
      }
      await this.localStream[mute ? 'close' : 'open']({
        type: 'audio',
        deviceId,
      });
      this.audioEnabled = !mute;
      if (deviceId) {
        this.microphoneId = deviceId;
      }
      this.log('_muteLocalAudio success:', mute, deviceId);
    } catch (error) {
      this.log('_muteLocalAudio fail:', mute, deviceId, error);
      return Promise.reject(error);
    }
  }

  /**
   * 新增流，如果以存在，则更新流
   * @param stream
   */
  public addStream(stream: any): void {
    const uid = stream.getId();
    if (this.remoteStreams.some((item) => item.getId() === uid)) {
      this.log('stream-added：订阅的流已存在，更新流');
      this.updateStream(stream);
    } else {
      this.log('stream-added：新增需要订阅的流');
      this.remoteStreams.push(stream);
    }
  }

  /**
   * 更新流
   * @param stream
   */
  public updateStream(stream: any): void {
    const uid = stream.getId();
    this.remoteStreams = this.remoteStreams.map((item) =>
      item.getId() === uid ? stream : item
    );
  }

  /**
   * 删除流
   * @param uid
   */
  public removeStream(uid: string): void {
    this.remoteStreams = this.remoteStreams.filter(
      (item) => item.getId() !== uid
    );
  }

  /**
   * 根据uid查找对应的视图
   * @param uid
   */
  public findRemoteView(uid: string): HTMLElement | undefined {
    const { view } = this.remoteViews.find((item) => item.uid === uid) || {
      view: undefined,
    };
    return view;
  }

  /**
   * 重置状态
   */
  public destroy(): void {
    // try {
    //   this.localStream.destroy();
    //   WebRTC2.destroy();
    // } catch (e) {
    //   // 为了兼容低版本，用try catch包裹一下
    // }
    this.localStream = null;
    this.remoteStreams = [];
    this.localView = undefined;
    this.remoteViews = [];
    this.audioEnabled = false;
    this.videoEnabled = false;
    this.microphoneId = '';
    this.cameraId = '';
    this.speakerId = '';
    this.log('rtcController destroy success');
  }

  private async _selectSpeakers(
    element: any,
    speakerId: string
  ): Promise<void> {
    if (element && element.sinkId === undefined) {
      return;
    }
    try {
      await element.setSinkId(speakerId);
      this.speakerId = speakerId;
    } catch (e) {
      return Promise.reject(e);
    }
  }
}

export default RTCController;
