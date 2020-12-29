import SDK from '../../assets/sdk/NIM_Web_SDK_v8.1.0.js';
import {
  DISCONNECT_FAILED,
  SIGNAL_NULL,
  CHANNELINFO_NULL,
  CALLTYPE_NULL,
  INVITE_ALL_FAILED,
  INVITE_PART_FAILED,
  CANCEL_PART_FAILED,
  SIGNAL_LEAVE_FAILED,
  DURATIONS_EMPTY,
  RTC_LEAVE_FAILED,
  INVITOR_CHANNELINFO_NULL,
} from '../constants/errors';
import {
  LoginParams,
  RParams,
  EventCode,
  CallType,
  Callback,
  ChannelInfo,
  Duration,
  InvitorChannelInfo,
  ChannelEvent,
  Member,
  RTCEvent,
  RoomInfo,
  MessageType,
  NetworkStats,
  BaseOptions,
  CallingStatus,
  ConnectStatus,
  Devices,
  DeviceType,
  SetupParams,
  TokenService,
} from '../types/common';
import BaseController from '../controllers/baseController';
import RTCController from '../controllers/rtcController';
import { RTCCalling as RTCCallingTypes } from '../types/rtcCalling';
import { uuid } from '../utils';
import version from '../utils/version';

class RTCCalling extends BaseController implements RTCCallingTypes {
  public static version = version;
  public static instance: RTCCalling;
  private signal: any = null; // im sdk实例
  private isConnect = false; // 是否已连接信令sdk
  private channelInfo: ChannelInfo | null = null; // 当前实例的信令channel信息
  private callingUserIds: string[] = []; // 呼叫中的account todo 其他人拒绝了如何知道
  private requestId = ''; // 邀请者邀请的请求id，之后取消邀请、拒绝、接受需要复用该requestId
  private callType: CallType | null = null; // 当前实例的呼叫类型
  private account = ''; // 当前实例的account
  private uid = ''; // 当前实例的uid，使用信令返回的
  private invitorChannelInfo: InvitorChannelInfo | null = null; // 呼叫者的信令channel信息
  private isGroupCall = false; // 是否是群呼
  private callStatus = CallingStatus.idle; // 通话状态
  private durations: Duration[] = []; // 单人通话的用户
  private userMap: { [uid: string]: string } = {}; // 用户映射，uid: account
  private callTimeout: number | undefined = undefined; // 主叫方呼叫超时时间
  private rejectTimeout: number | undefined = undefined; // 被叫方超时拒绝时间
  private rtc: RTCController;
  private eventBound = false;

  constructor({ debug = true }: Partial<BaseOptions> = { debug: true }) {
    super({ debug });
    this.rtc = new RTCController({ debug });
  }

  /**
   * 初始化G2，需要在login之前调用
   * @param params
   */
  public setupAppKey(options: SetupParams): void {
    return this.rtc.setupAppKey(options);
  }

  /**
   * 登录IM，所有功能先进行登录才能使用
   * @param params
   */
  public login({
    account,
    token,
    success,
    failed,
    ...opt
  }: LoginParams): Promise<void> {
    return new Promise((resolve, reject) => {
      const finalOpt = {
        ...opt,
        appKey: this.rtc.appKey,
        account,
        token,
        debug: this.debug,
        onconnect: (): void => {
          this.log('login success');
          opt.onconnect?.();
          this.isConnect = true;
          this.account = account;
          // 接收一次离线消息
          this.signal.signalingSync();
          success?.();
          resolve();
        },
        onerror: (error: RParams): void => {
          this.log('login fail:', error);
          opt.onerror?.();
          failed?.(error);
          reject(error);
        },
      };
      this.signal = SDK.NIM.getInstance(finalOpt);
      if (!this.eventBound) {
        this.eventBound = true;
        this.addEventListener();
      }
    });
  }

  /**
   * 登出IM
   * @param params
   */
  public async logout(params?: Callback): Promise<void> {
    try {
      if (!this.isConnect) {
        throw DISCONNECT_FAILED;
      }
      if (!this.signal) {
        throw SIGNAL_NULL;
      }
      await this.signal.disconnect();
      this.removeLocalUid();
      this.log('logout success');
      params?.success?.();
    } catch (error) {
      this.log('logout fail:', error);
      params?.failed?.(DISCONNECT_FAILED);
      return Promise.reject(DISCONNECT_FAILED);
    }
  }

  /**
   * 设置获取token的异步函数，在加入RTC之前调用
   * @param cb 获取token的异步函数
   */
  public setTokenService(cb: TokenService): void {
    return this.rtc.setTokenService(cb);
  }

  /**
   * 注册代理
   * @param eventCode
   * @param callback
   */
  public addDelegate(
    eventCode: EventCode,
    callback: (...args: any) => void
  ): void {
    this.on<EventCode>(eventCode, callback);
  }

  /**
   * 移除代理
   * @param eventCode
   */
  public removeDelegate(eventCode: EventCode): void {
    this.off<EventCode>(eventCode);
  }

  /**
   * 单人呼叫
   * @param params
   */
  public async call(
    params: {
      userId: string;
      type: CallType;
    } & Callback
  ): Promise<void> {
    try {
      if (!this.signal) {
        throw SIGNAL_NULL;
      }
      if (!this.channelInfo) {
        const channelInfo = await this.signalCreate({
          type: params.type,
        });
        const res = await this.signal.signalingJoin({
          channelId: channelInfo.channelId,
          offlineEnabled: true, // 是否存离线通知
        });
        this.setLocalUid(res.members[0].uid);
        this.log('signalingJoin success！');
      }
      this.callStatus = CallingStatus.calling;
      this.isGroupCall = false;
      this.durations = [
        {
          accid: this.userMap[this.uid],
          duration: Date.now(),
        },
      ];
      this.callingUserIds = [params.userId];
      this.requestId = uuid();
      await this.signalInvite(params.userId);
      this.log('call success');
      params.success?.();
      // 主叫超时，如果设置了timeout，并且到时后依然在calling状态，则cancel掉
      if (this.callTimeout !== undefined) {
        setTimeout(async () => {
          if (this.callStatus === CallingStatus.calling) {
            try {
              await this.signalCancel();
              this.log('signalInvite timeout cancel success', this.callTimeout);
            } catch (error) {
              this.log(
                'signalInvite timeout cancel fail: ',
                error,
                this.callTimeout
              );
            } finally {
              this.emit<EventCode>('onCallingTimeOut');
              await this.sendMessage(params.userId, 'timeout');
              await this.destroy();
            }
          }
        }, this.callTimeout);
      }
    } catch (error) {
      this.log('call fail:', error);
      params.failed?.(error as RParams);
      return Promise.reject(error as RParams);
    }
  }

  /**
   * 多人呼叫
   * @param params
   */
  public async groupCall(
    params: {
      userIds: string[];
      type: CallType;
      groupId?: string;
    } & Callback
  ): Promise<void> {
    try {
      if (!this.signal) {
        throw SIGNAL_NULL;
      }
      if (!this.channelInfo) {
        await this.signalCreate({
          type: params.type,
        });
        await this.joinSignalAndRTC();
      }
      this.callStatus = CallingStatus.calling;
      this.isGroupCall = true;
      this.callingUserIds = [...params.userIds];
      this.requestId = uuid();
      await this.signalGroupInvite({
        userIds: params.userIds,
        groupId: params.groupId,
      });
      this.log('groupCall success');
      params.success?.();
      // 主叫超时，如果设置了timeout，并且到时后依然在calling状态，则cancel掉
      if (this.callTimeout !== undefined) {
        setTimeout(async () => {
          if (this.callStatus === CallingStatus.calling) {
            try {
              await Promise.all([this.signalCancel(), this.rtcLeave()]);
              this.log(
                'signalGroupInvite timeout cancel success',
                this.callStatus
              );
            } catch (error) {
              this.log(
                'signalGroupInvite timeout cancel fail: ',
                error,
                this.callStatus
              );
            } finally {
              this.emit<EventCode>('onCallingTimeOut');
              await this.destroy();
            }
          }
        }, this.callTimeout);
      }
    } catch (error) {
      this.log('groupCall fail', error);
      params.failed?.(error as RParams);
      return Promise.reject(error as RParams);
    }
  }

  /**
   * 1对1取消呼叫
   * @param params
   */
  public async cancel(params?: Callback): Promise<void> {
    try {
      if (!this.signal) {
        throw SIGNAL_NULL;
      }
      if (!this.channelInfo) {
        throw CHANNELINFO_NULL;
      }
      let to = '';
      if (!this.isGroupCall) {
        to =
          this.callingUserIds.find((item) => item !== this.userMap[this.uid]) ||
          '';
      }
      await this.signalCancel();
      if (!this.isGroupCall) {
        await this.sendMessage(to, 'canceled');
        await this.destroy();
      }
      this.log('cancel success');
      params?.success?.();
    } catch (error) {
      this.log('cancel fail', error);
      params?.failed?.(error as RParams);
      return Promise.reject(error as RParams);
    }
  }

  /**
   * 接受呼叫
   * @param params
   */
  public async accept(params?: Callback): Promise<void> {
    try {
      if (!this.signal) {
        throw SIGNAL_NULL;
      }
      await this.acceptSignal();
      this.callStatus = CallingStatus.inCall;
      this.log('accept success');
      params?.success?.();
    } catch (error) {
      this.log('accept fail:', error);
      params?.failed?.(error as RParams);
      return Promise.reject(error as RParams);
    }
  }

  /**
   * 拒绝呼叫
   * @param params
   */
  public async reject(params?: Callback): Promise<void> {
    try {
      if (!this.invitorChannelInfo) {
        throw INVITOR_CHANNELINFO_NULL;
      }
      await this.rejectCall(false, {
        channelId: this.invitorChannelInfo.channelId,
        account: this.invitorChannelInfo.from,
        requestId: this.invitorChannelInfo.requestId,
      });
      this.log('reject success');
      params?.success?.();
    } catch (error) {
      this.log('reject fail:', error);
      params?.failed?.(error as RParams);
      return Promise.reject(error as RParams);
    } finally {
      this.invitorChannelInfo = null;
    }
  }

  /**
   * 离开，不影响通话中的其他人
   * @param params
   */
  public async leave(params?: Callback): Promise<void> {
    try {
      if (!this.signal) {
        throw SIGNAL_NULL;
      }
      if (!this.channelInfo) {
        throw CHANNELINFO_NULL;
      }
      // if (!this.isGroupCall) {
      //   const to =
      //     Object.values(this.userMap).find(
      //       (item) => item !== this.userMap[this.uid]
      //     ) || '';
      //   await this.sendMessage(to, 'complete');
      // }
      await Promise.all([this.signalLeave(), this.rtcLeave()]);
      this.log('leave success');
      params?.success?.();
    } catch (error) {
      this.log('leave fail:', error);
      params?.failed?.(error as RParams);
      return Promise.reject(error as RParams);
    } finally {
      this.resetChannel();
    }
  }

  /**
   * 挂断，同时挂断其他人
   * @param params
   */
  public async hangup(params?: Callback): Promise<void> {
    try {
      if (!this.signal) {
        throw SIGNAL_NULL;
      }
      if (!this.channelInfo) {
        throw CHANNELINFO_NULL;
      }
      await Promise.all([this.signalCancel(), this.rtcLeave()]);
      await this.signalClose();
      // if (!this.isGroupCall) {
      //   const to =
      //     Object.values(this.userMap).find(
      //       (item) => item !== this.userMap[this.uid]
      //     ) || '';
      //   await this.sendMessage(to, 'complete');
      // }
      this.log('hangup success');
      params?.success?.();
    } catch (error) {
      this.log('hangup fail:', error);
      params?.failed?.(error as RParams);
      return Promise.reject(error as RParams);
    } finally {
      this.resetChannel();
    }
  }

  /**
   * 开启/关闭摄像头
   * @param enabled true 打开 false 关闭
   */
  public enableLocalVideo(enabled: boolean): Promise<void> {
    return this.rtc.enableLocalVideo(enabled);
  }

  /**
   * 开启/关闭麦克风
   * @param mute true 关闭 false 开启
   */
  public muteLocalAudio(mute: boolean): Promise<void> {
    return this.rtc.muteLocalAudio(mute);
  }

  /**
   * 切换通话类型
   * @param type CallType
   */
  public async switchCallType(type: CallType): Promise<void> {
    try {
      if (type !== 1) {
        throw 'sorry，目前仅支持视频切换为音频';
      }
      if (!this.signal) {
        throw SIGNAL_NULL;
      }
      if (!this.channelInfo) {
        throw CHANNELINFO_NULL;
      }
      try {
        await this.rtc.enableLocalVideo(false);
      } catch (error) {
        this.log('enableLocalVideo in switchCallType fail but resolve', error);
      }
      // 通知对端需要切换为音频
      await this.signal.signalingControl({
        channelId: this.channelInfo.channelId,
        account: '',
        attachExt: JSON.stringify({ cid: 2, type: 1 }),
      });
      this.log('switchCallType success');
    } catch (error) {
      this.log('switchCallType fail: ', error);
      return Promise.reject(error);
    }
  }

  /**
   * 设置远端音频静音
   * @param mute true 关闭 false 开启
   * @param userId IM的account账号
   */
  public async setAudioMute(mute: boolean, userId: string): Promise<void> {
    const uid = this.findUid(userId);
    return this.rtc.setAudioMute(mute, uid);
  }

  /**
   * 设置自己画面，在播放之前调用
   * @param view 位于的DOM节点
   */
  public setupLocalView(view?: HTMLElement): void {
    return this.rtc.setupLocalView(view);
  }

  /**
   * 设置其他用户画面，在播放之前调用
   * @param userId IM的account账号
   * @param view 位于的DOM节点
   */
  public setupRemoteView(userId: string, view?: HTMLElement): void {
    const uid = this.findUid(userId);
    return this.rtc.setupRemoteView(uid, view);
  }

  /**
   * 选择扬声器
   * @param deviceId 设备id
   */
  public selectSpeakers(deviceId: string): Promise<void> {
    return this.rtc.selectSpeakers(deviceId);
  }

  /**
   * 获取设备列表
   */
  public getDevices(): Promise<Devices> {
    return this.rtc.getDevices();
  }

  /**
   * 切换设备
   * @param type 设备类型
   * @param deviceId 设备id
   */
  public switchDevice(type: DeviceType, deviceId: string): Promise<void> {
    return this.rtc.switchDevice(type, deviceId);
  }

  /**
   * 设置呼叫超时时间，在呼叫前调用
   * @param t 超时时间，单位ms
   */
  public setCallTimeout(t: number): void {
    this.callTimeout = this.rejectTimeout = t;
  }

  /**
   * 获取房间信息
   */
  public async getRoomInfo(): Promise<RoomInfo> {
    try {
      if (!this.channelInfo) {
        throw CHANNELINFO_NULL;
      }
      if (!this.signal) {
        throw SIGNAL_NULL;
      }
      const info: Omit<
        RoomInfo,
        'uid'
      > = await this.signal.signalingGetChannelInfo({
        channelName: this.channelInfo.channelName,
      });
      this.log('getRoomInfo success');
      return {
        ...info,
        uid: this.uid,
      };
    } catch (error) {
      this.log('getRoomInfo fail: ', error);
      return Promise.reject(error);
    }
  }

  /**
   * 获取sdk实例
   */
  public getSdkInstance(): any {
    return {
      signal: this.signal,
      rtcClient: this.rtc.client,
      WebRTC2: this.rtc.webrtc,
    };
  }

  /**
   * 创建信令
   */
  private async signalCreate({
    type,
  }: {
    type: CallType;
  }): Promise<ChannelInfo> {
    if (!this.callType) {
      this.callType = type;
    }
    try {
      this.channelInfo = (await this.signal.signalingCreate({
        type,
      })) as ChannelInfo;
      this.log(
        'signalingCreate Success',
        'channelInfo:',
        this.channelInfo,
        'callType:',
        this.callType
      );
      return this.channelInfo;
    } catch (error) {
      this.log('signalingCreate failed:', error, 'callType:', this.callType);
      return Promise.reject(error);
    }
  }

  /**
   * 单邀
   * @param userId IM的account账号
   */
  private async signalInvite(userId: string): Promise<void> {
    if (!this.channelInfo) {
      return Promise.reject(CHANNELINFO_NULL);
    }
    try {
      // 各端统一的扩展字段
      const attachExt = JSON.stringify({
        callType: 0,
      });
      const param = {
        channelId: this.channelInfo.channelId,
        offlineEnabled: true,
        account: userId,
        requestId: this.requestId,
        pushInfo: {
          pushTitle: '邀请通知',
          pushContent: '你收到了邀请',
          pushPayload: {},
          needPush: true,
          needBadge: true,
        },
        attachExt,
      };
      this.log('signalingInvite in call', param);
      try {
        await this.signal.signalingInvite(param);
      } catch (error) {
        // 过滤对方离线的错误
        if (!/OFFLINE/i.test(error?.message)) {
          throw error;
        }
      }
      this.log('signalInvite success！');
    } catch (error) {
      this.log(
        'signalInvite fail:',
        {
          channelId: this.channelInfo.channelId,
          requestId: this.requestId,
        },
        error
      );
      this.callingUserIds = this.callingUserIds.filter(
        (item) => item !== userId
      );
      // await this.signalLeave();
      await this.destroy();
      return Promise.reject(error);
    }
  }

  /**
   * 群邀
   */
  private async signalGroupInvite(params: {
    userIds: string[];
    groupId?: string;
  }): Promise<void> {
    if (!this.channelInfo) {
      return Promise.reject(CHANNELINFO_NULL);
    }
    // 各端统一的扩展字段
    const attachExt = JSON.stringify({
      callType: 1,
      callUserList: this.callingUserIds,
      groupID: params.groupId === undefined ? null : params.groupId,
    });
    const results = await Promise.allSettled(
      params.userIds.map((userId) => {
        const param = {
          channelId: (this.channelInfo as ChannelInfo).channelId,
          offlineEnabled: true,
          account: userId,
          requestId: this.requestId,
          pushInfo: {
            pushTitle: '邀请通知',
            pushContent: '你收到了邀请',
            pushPayload: {},
            needPush: true,
            needBadge: true,
          },
          attachExt,
        };
        this.log('signalingInvite in groupCall', param);
        return this.signal
          .signalingInvite(param)
          .then(() => {
            return Promise.resolve();
          })
          .catch((error) => {
            // 过滤对方离线的错误
            if (/OFFLINE/i.test(error?.message)) {
              return Promise.resolve();
            }
            return Promise.reject(error);
          });
      })
    );
    // 全部失败才返回reject，否则都返回成功
    if (results.every((item) => item.status === 'rejected')) {
      this.log('signalGroupInvite fail', results);
      // await this.signalLeave();
      await this.destroy();
      return Promise.reject(INVITE_ALL_FAILED);
    }
    // 部分成功，触发通知，不影响流程
    const errorUserIds = params.userIds.filter(
      (item, index) => results[index].status === 'rejected'
    );
    if (errorUserIds.length) {
      this.log('signalGroupInvite part fail:', errorUserIds);
      this.emit<EventCode>('onError', INVITE_PART_FAILED, errorUserIds);
    }
    this.callingUserIds = this.callingUserIds.filter(
      (item) => !errorUserIds.includes(item)
    );
    this.log('signalGroupInvite success');
    // 成功
    return Promise.resolve();
  }

  /**
   * 取消呼叫中的信令
   */
  private async signalCancel(): Promise<void> {
    const results = await Promise.allSettled(
      this.callingUserIds.map((account) =>
        this.signal.signalingCancel({
          channelId: (this.channelInfo as ChannelInfo).channelId,
          account,
          requestId: this.requestId,
          offlineEnabled: true,
        })
      )
    );
    this.callStatus = CallingStatus.idle;
    // 全部走成功逻辑，有失败则触发通知
    const errorUserIds = this.callingUserIds.filter(
      (item, index) => results[index].status === 'rejected'
    );
    if (errorUserIds.length) {
      this.log('signalCancel part fail:', errorUserIds);
      this.emit<EventCode>('onError', CANCEL_PART_FAILED, errorUserIds);
    }
    this.callingUserIds = [];
    this.log('signalCancel success');
    return Promise.resolve();
  }

  /**
   * 离开信令房间
   */
  private async signalLeave(): Promise<void> {
    try {
      await this.signal.signalingLeave({
        channelId: (this.channelInfo as ChannelInfo).channelId,
        offlineEnabled: true,
      });
      this.log('signalLeave success');
    } catch (error) {
      this.log('signalLeave fail but resolve:', error);
      this.emit<EventCode>('onError', SIGNAL_LEAVE_FAILED);
    } finally {
      return Promise.resolve();
    }
  }

  /**
   * 退出信令
   */
  private async signalClose(): Promise<void> {
    try {
      if (!this.signal) {
        throw SIGNAL_NULL;
      }
      if (!this.channelInfo) {
        throw CHANNELINFO_NULL;
      }
      await this.signal.signalingClose({
        channelId: this.channelInfo.channelId,
        offlineEnabled: true,
      });
      this.log('signalClose success');
    } catch (error) {
      this.log('signalClose fail but resolve:', this.channelInfo, error);
      // 忽略close错误
    } finally {
      return Promise.resolve();
    }
  }

  /**
   * 本端加入信令和G2
   */
  private async joinSignalAndRTC(): Promise<void> {
    if (!this.channelInfo) {
      return Promise.reject(CHANNELINFO_NULL);
    }
    if (!this.callType) {
      return Promise.reject(CALLTYPE_NULL);
    }
    try {
      const res = await this.signal.signalingJoin({
        channelId: this.channelInfo.channelId,
        offlineEnabled: true, // 是否存离线通知
      });
      this.setLocalUid(res.members[0].uid);
      await this.rtc.joinRTCChannel({
        channelName: this.channelInfo.channelId,
        type: this.callType,
        uid: this.uid,
      });
      this.log('joinSignalAndRTC success', res);
    } catch (error) {
      this.log('joinSignalAndRTC fail:', error);
      this.destroy();
      return Promise.reject(error);
    }
  }

  /**
   * 离开G2房间
   */
  private async rtcLeave(): Promise<void> {
    try {
      await this.rtc.rtcLeave();
      this.log('rtcLeave success');
    } catch (error) {
      this.log('rtcLeave fail but resolve:', error);
      this.emit<EventCode>('onError', RTC_LEAVE_FAILED);
    } finally {
      return Promise.resolve();
    }
  }

  /**
   * 接受信令邀请
   * 如果是多人通话，需要加入RTC房间
   */
  private async acceptSignal(): Promise<void> {
    try {
      if (!this.invitorChannelInfo) {
        return Promise.reject(INVITOR_CHANNELINFO_NULL);
      }
      const res = await this.signal.signalingAccept({
        channelId: this.invitorChannelInfo.channelId,
        account: this.invitorChannelInfo.from,
        requestId: this.invitorChannelInfo.requestId,
        offlineEnabled: true,
        autoJoin: true,
      });
      this.log('signalingAccept success', res);
      // 成功接收邀请后，更新本实例的channelInfo，同时清空邀请者的channelInfo，防止下次无效邀请
      this.uid = res.members.find(
        (item: any) => item.accid === this.account
      ).uid;
      this.channelInfo = res;
      this.callType = this.invitorChannelInfo.type;
      res.members.forEach((item) => {
        if (!this.userMap[item.uid]) {
          this.userMap[item.uid] = item.accid;
        }
      });
      this.invitorChannelInfo = null;
      this.log('acceptSignal success', res);
      if (this.isGroupCall) {
        await this.rtc.joinRTCChannel({
          channelName: (this.channelInfo as ChannelInfo).channelId,
          type: this.callType,
          uid: this.uid,
        });
      }
    } catch (error) {
      this.log('acceptSignal fail:', error);
      this.destroy();
      return Promise.reject(error);
    }
  }

  /**
   * 拒绝通话
   * @param isBusy
   */
  private async rejectCall(
    isBusy = false,
    invitor: {
      channelId: string;
      account: string;
      requestId: number;
    }
  ): Promise<void> {
    try {
      if (!this.signal) {
        throw SIGNAL_NULL;
      }
      const _params: any = {
        channelId: invitor.channelId,
        account: invitor.account,
        requestId: invitor.requestId,
        offlineEnabled: true,
      };
      if (isBusy) {
        _params.attachExt = '601';
      }
      await this.signal.signalingReject(_params);
      // 成功拒绝邀请后，需要清空邀请者的channelInfo，防止下次无效拒绝
      this.log('rejectCall success');
    } catch (error) {
      this.log('rejectCall fail:', invitor, error);
      return Promise.reject(error as RParams);
    } finally {
      if (!isBusy) {
        this.callStatus = CallingStatus.idle;
      }
    }
  }

  /**
   * 设置本端uid
   * @param uid
   */
  private setLocalUid(uid: string): void {
    this.uid = uid;
    this.userMap[uid] = this.account;
  }

  /**
   * 移除本端uid
   */
  private removeLocalUid(): void {
    delete this.userMap[this.uid];
    this.uid = '';
    this.account = '';
  }

  /**
   * 更新通话中的用户数
   * @param members
   */
  private filterCallingUserByMembers(members: Member[] = []): void {
    this.log('filterCallingUserByMembers:', members);
    this.callingUserIds = this.callingUserIds.filter((item) =>
      members.every((member) => member.account !== item)
    );
  }

  /**
   * 根据userId查找uid
   * @param userId IM的account账号
   */
  private findUid(userId: string): string {
    let uid = '';
    Object.keys(this.userMap).forEach((key) => {
      if (this.userMap[key] === userId) {
        uid = key;
      }
    });
    return uid;
  }

  /**
   * 单人通话下，需要通知服务端退出的情况
   * @param userId IM的account账号
   * @param status
   */
  private sendMessage(userId: string, status: MessageType): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.signal) {
        return reject(SIGNAL_NULL);
      }
      if (!this.callType) {
        return reject(CALLTYPE_NULL);
      }
      if (!this.channelInfo) {
        return reject(CHANNELINFO_NULL);
      }
      if (!this.durations.length) {
        return reject(DURATIONS_EMPTY);
      }
      if (!userId) {
        return reject('to is invalid');
      }
      const statusMap: { [key in MessageType]: number } = {
        complete: 1,
        canceled: 2,
        rejected: 3,
        timeout: 4,
        busy: 5,
      };
      const attach = {
        type: this.callType,
        channelId: this.channelInfo.channelId,
        status: statusMap[status],
        durations: this.durations.map((item) => ({
          ...item,
          duration: item.duration ? (Date.now() - item.duration) / 1000 : null,
        })),
      };
      this.signal.sendG2Msg({
        attach,
        scene: 'p2p',
        to: userId,
        done: (error: any) => {
          if (error) {
            this.log('sendMessage fail:', attach, error);
            return reject(error);
          }
          this.log('sendMessage success', attach, userId);
          this.emit<EventCode>('onMessageSent', userId);
          resolve();
        },
      });
    });
  }

  /**
   * 批量标记消息已读
   * @param events
   */
  private async batchMarkEvent(events: ChannelEvent[]): Promise<void> {
    // 只要是在线消息，就标记已读
    try {
      const msgids = events.map((item) => item.msgid + '');
      await this.signal.signalingMarkMsgRead({
        msgid: msgids,
      });
      this.log('在线 signalingMarkMsgRead success');
    } catch (e) {
      this.log('在线 signalingMarkMsgRead fail: ', e);
    } finally {
      return Promise.resolve();
    }
  }

  /**
   * 重置状态
   */
  private resetChannel(): void {
    this.rtc.destroy();
    this.channelInfo = null;
    this.callingUserIds = [];
    this.requestId = '';
    this.callType = null;
    this.uid = '';
    this.invitorChannelInfo = null;
    this.isGroupCall = false;
    this.callStatus = CallingStatus.idle;
    this.durations = [];
    this.userMap = {};
    this.log('resetChannel success');
  }

  private async destroy(): Promise<void> {
    await Promise.all([this.signalClose(), this.rtcLeave()]);
    this.resetChannel();
    this.log('destroy success');
  }

  /**
   * 注册信令和G2的事件监听
   */
  private addEventListener(): void {
    // 信令相关的事件监听
    // 在线通知
    this.signal.on(
      'signalingNotify',
      async (event: ChannelEvent): Promise<void> => {
        await this.batchMarkEvent([event]);
        switch (event.eventType) {
          case 'ROOM_JOIN':
            this.signalRoomJoinHandler(event);
            break;
          case 'ROOM_CLOSE':
            this.roomCloseHandler(event);
            break;
          case 'INVITE':
            this.inviteHandler(event);
            break;
          case 'CANCEL_INVITE':
            this.cancelInviteHandler(event);
            break;
          case 'REJECT':
            this.rejectHandler(event);
            break;
          case 'ACCEPT':
            this.acceptHandler(event);
            break;
          case 'CONTROL':
            this.controlHandler(event);
            break;
        }
      }
    );
    // 在线多端同步通知
    this.signal.on(
      'signalingMutilClientSyncNotify',
      async (event: ChannelEvent): Promise<void> => {
        this.log('signalingMutilClientSyncNotify', event);
        await this.batchMarkEvent([event]);
        switch (event.eventType) {
          // 拒绝邀请
          case 'REJECT':
            this.resetChannel();
            this.emit<EventCode>('onOtherClientReject');
            break;
          // 接收邀请
          case 'ACCEPT':
            this.resetChannel();
            this.emit<EventCode>('onOtherClientAccept');
            break;
        }
      }
    );
    // 离线通知
    this.signal.on(
      'signalingUnreadMessageSyncNotify',
      async (data: any[]): Promise<void> => {
        this.log('signalingUnreadMessageSyncNotify', data);
        await this.batchMarkEvent(data);
        // 过滤掉无效的离线消息
        const validMessages = data.filter((item) => !item.channelInValid);
        const rejects = validMessages.filter(
          (item) => item.eventType === 'REJECT'
        );
        const invites = validMessages
          .filter((item) => item.eventType === 'INVITE')
          .sort((a, b) => b.channelCreateTime - a.channelCreateTime);
        if (
          invites[0] &&
          rejects.every((item) => item.requestId !== invites[0].requestId)
        ) {
          await this.inviteHandler(invites[0]);
        }
      }
    );

    // G2 相关的事件监听
    // 加入房间
    this.rtc.client.on('peer-online', (event: RTCEvent) => {
      this.roomJoinHandler(event);
    });

    // 离开房间
    this.rtc.client.on('peer-leave', (event: RTCEvent) => {
      this.leaveHandler(event);
    });

    // 收到远端订阅的通知
    this.rtc.client.on('stream-added', async (event: RTCEvent) => {
      this.log('stream-added:', event);
      const stream = event.stream;
      this.rtc.addStream(stream);
      try {
        await this.rtc.rtcSubscribe(stream, { audio: true, video: true });
      } catch (error) {
        this.log('stream-added fail: ', error);
      }
    });

    // 收到远端停止订阅的通知
    this.rtc.client.on('stream-removed', (event: RTCEvent) => {
      this.log('stream-removed:', 'callType:', this.callType, event);
      const stream = event.stream;
      const uid = stream.getId();
      stream.stop();
      this.log('stream-removed：停止订阅流，更新流');
      this.rtc.updateStream(stream);
      const account = this.userMap[uid];
      this.emit<EventCode>('onAudioAvailable', {
        userId: account,
        uid,
        available: stream.audio,
      });
      if (this.callType === 2) {
        this.emit<EventCode>('onCameraAvailable', {
          userId: account,
          uid,
          available: stream.video,
        });
      }
    });

    // 收到远端的流，准备播放
    this.rtc.client.on('stream-subscribed', async (event: RTCEvent) => {
      this.log('stream-subscribed:', 'callType:', this.callType, event);
      const stream = event.stream;
      const uid = stream.getId();
      const account = this.userMap[uid];
      this.emit<EventCode>('onAudioAvailable', {
        userId: account,
        uid,
        available: stream.audio,
      });
      if (this.callType === 2) {
        this.emit<EventCode>('onCameraAvailable', {
          userId: account,
          uid,
          available: stream.video,
        });
      }
      const view = this.rtc.findRemoteView(uid);
      try {
        await this.rtc.startStreamPreview(stream, 'remote', view);
        this.log('startRemoteStreamPreview success', stream, view);
      } catch (error) {
        this.log('startRemoteStreamPreview fail: ', stream, view, error);
      }
    });

    // 网络状态回调
    this.rtc.client.on('network-quality', (stats: NetworkStats[]) => {
      // this.log('network-quality: ', stats);
      const res: { [accid: string]: Omit<NetworkStats, 'uid'> } = {};
      stats.forEach((item) => {
        const accid = this.userMap[item.uid];
        if (accid) {
          res[accid] = {
            uplinkNetworkQuality: item.uplinkNetworkQuality,
            downlinkNetworkQuality: item.downlinkNetworkQuality,
          };
        }
      });
      this.emit<EventCode>('onUserNetworkQuality', res);
    });

    // sdk与服务器连接状态回调
    this.rtc.client.on('connection-state-change', (status: ConnectStatus) => {
      if (status === 'DISCONNECTED') {
        this.emit<EventCode>('onDisconnect');
      }
    });
  }

  private signalRoomJoinHandler(event: ChannelEvent): void {
    this.log('signalRoomJoinHandler:', event);
    let attach;
    try {
      attach = JSON.parse(event.attach);
    } catch (error) {
      attach = {};
    }
    const uid = (attach.member || {})[2];
    this.filterCallingUserByMembers([{ uid, account: event.from }]);
    this.userMap[uid] = event.from;
  }

  private async roomCloseHandler(event: ChannelEvent): Promise<void> {
    this.log('roomCloseHandler:', event);
    await this.destroy();
    this.emit<EventCode>('onCallEnd');
  }

  private roomJoinHandler(event: RTCEvent): void {
    const account = this.userMap[event.uid];
    this.log('roomJoinHandler:', account, event);
    this.emit<EventCode>('onUserEnter', account);
  }

  private async acceptHandler(event: ChannelEvent): Promise<void> {
    this.callStatus = CallingStatus.inCall;
    this.emit<EventCode>('onUserAccept', event.from);
    // 单人通话的场景下，这时候才加入RTCChannel
    if (this.isGroupCall) {
      this.log('acceptHandler from group:', event);
      return Promise.resolve();
    }
    try {
      if (!this.channelInfo) {
        throw CHANNELINFO_NULL;
      }
      if (!this.callType) {
        throw CALLTYPE_NULL;
      }
      if (!this.signal) {
        throw SIGNAL_NULL;
      }
      await this.rtc.joinRTCChannel({
        channelName: this.channelInfo.channelId,
        type: this.callType,
        uid: this.uid,
      });
      this.durations.push({
        accid: event.from,
        duration: Date.now(),
      });
      // 发送一条自定义信令给接收方，告知他可以加入RTC房间了
      await this.signal.signalingControl({
        channelId: this.channelInfo.channelId,
        account: event.from,
        attachExt: JSON.stringify({ cid: 1 }),
      });
      this.log('acceptHandler from signal success:', event);
    } catch (error) {
      this.log('acceptHandler from signal fail:', event, error);
      this.emit<EventCode>('onError', error);
    }
  }

  private async inviteHandler(event: ChannelEvent): Promise<void> {
    if (event.channelInValid) {
      return;
    }
    this.log('inviteHandler:', 'callStatus:', this.callStatus, event);
    if (this.callStatus !== CallingStatus.idle) {
      try {
        await this.rejectCall(true, {
          channelId: event.channelId,
          account: event.from,
          requestId: event.requestId,
        });
      } catch (error) {
        this.log('reject error in inviteHandler: ', error);
      }
      return;
    }
    let attachExt;
    try {
      attachExt = JSON.parse(event.attachExt);
    } catch (error) {
      attachExt = {};
    }
    const callType = Number(event.type) as CallType;
    this.invitorChannelInfo = {
      channelId: event.channelId,
      channelName: event.channelName,
      creatorId: event.creator,
      requestId: event.requestId,
      from: event.from,
      type: callType,
    };
    this.callStatus = CallingStatus.called;
    this.isGroupCall = attachExt.callType + '' === '1';
    this.emit<EventCode>('onInvited', {
      invitor: event.from,
      userIds: attachExt.callUserList,
      isFromGroup: this.isGroupCall,
      groupId: attachExt.groupID,
      type: callType,
    });
    // 被叫超时后，如果还是called状态，会自动拒绝
    if (this.rejectTimeout !== undefined) {
      setTimeout(async () => {
        if (this.callStatus === CallingStatus.called) {
          try {
            await this.rejectCall(false, {
              channelId: (this.invitorChannelInfo as InvitorChannelInfo)
                .channelId,
              account: (this.invitorChannelInfo as InvitorChannelInfo).from,
              requestId: (this.invitorChannelInfo as InvitorChannelInfo)
                .requestId,
            });
            this.log('reject timeout success', this.rejectTimeout);
          } catch (error) {
            this.log('reject timeout fail: ', error, this.rejectTimeout);
          } finally {
            this.invitorChannelInfo = null;
            this.emit<EventCode>('onCallingTimeOut');
          }
        }
      }, this.rejectTimeout);
    }
  }

  private cancelInviteHandler(event: ChannelEvent): void {
    this.log('cancelInviteHandler:', event);
    this.callStatus = CallingStatus.idle;
    this.emit<EventCode>('onUserCancel', event.from);
  }

  private async rejectHandler(event: ChannelEvent): Promise<void> {
    if (
      Number(event.requestId) !== Number(this.requestId) ||
      event.to !== this.account
    ) {
      this.log('rejectHandler fail: invalid reject');
      return;
    }
    this.log('rejectHandler:', event);
    this.filterCallingUserByMembers([{ uid: '', account: event.from }]);
    // 收到占线扩展字段
    if (event.attachExt === '601') {
      this.emit<EventCode>('onUserBusy', event.from);
      if (!this.isGroupCall) {
        await this.sendMessage(event.from, 'busy');
      }
    } else {
      this.emit<EventCode>('onUserReject', event.from);
      if (!this.isGroupCall) {
        await this.sendMessage(event.from, 'rejected');
      }
    }
    if (!this.isGroupCall) {
      await this.destroy();
    }
  }

  private async controlHandler(event: ChannelEvent): Promise<void> {
    this.log(
      'controlHandler: ',
      'channelInfo: ',
      this.channelInfo,
      'callType: ',
      this.callType,
      event
    );
    try {
      if (!this.channelInfo) {
        throw CHANNELINFO_NULL;
      }
      if (!this.callType) {
        throw CALLTYPE_NULL;
      }
      let attachExt;
      try {
        attachExt = JSON.parse(event.attachExt);
      } catch (error) {
        attachExt = {};
      }
      if (attachExt.cid === 1) {
        await this.rtc.joinRTCChannel({
          channelName: this.channelInfo.channelId,
          type: this.callType,
          uid: this.uid,
        });
        if (!this.isGroupCall) {
          this.durations = [
            {
              accid: this.userMap[this.uid],
              duration: Date.now(),
            },
            {
              accid: event.from,
              duration: Date.now(),
            },
          ];
        }
        this.log('controlHandler joinRTCChannel success', this.durations);
      } else if (attachExt.cid === 2) {
        if (attachExt.type === 1) {
          // todo 支持其他类型
          this.emit<EventCode>('onCallTypeChange', 1);
          await this.rtc.enableLocalVideo(false);
          this.log('controlHandler switchCallType success');
        }
      }
      this.log('controlHandler success: ');
    } catch (error) {
      this.log('controlHandler fail: ', error);
    }
  }

  private async leaveHandler(event: RTCEvent): Promise<void> {
    this.log('leaveHandler:', event);
    const uid = event.uid;
    this.rtc.removeStream(uid);
    const account = this.userMap[uid];
    delete this.userMap[uid];
    // if (!this.isGroupCall) {
    //   await Promise.all([this.signalLeave(), this.rTCLeave()]);
    //   this.resetChannel();
    //   // await this.destroy();
    // }
    if (event.reason === '0') {
      this.emit<EventCode>('onUserLeave', account);
    } else {
      this.emit<EventCode>('onUserDisconnect', account);
    }
  }

  public static getInstance(
    { debug = true }: Partial<BaseOptions> = { debug: true }
  ): RTCCalling {
    if (!this.instance) {
      this.instance = new RTCCalling({ debug });
    }
    return this.instance;
  }
}

export default RTCCalling;
