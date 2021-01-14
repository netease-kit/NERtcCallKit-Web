export type CallType = 1 | 2 | 3; // 1:音频;2:视频;3:其他
export type Code = string | number;
export type Message = string;
export type RParams = {
  code: Code;
  message?: Message;
};
export type ErrorMessage = {
  code: string;
  message: string;
};
export type RCallback<T = RParams> = (params: T) => void;
export type RPromise<T = RParams> = Promise<T>;
export type EventCode =
  | 'onInvited'
  | 'onUserEnter'
  | 'onUserAccept'
  | 'onUserReject'
  | 'onUserCancel'
  | 'onUserBusy'
  | 'onUserLeave'
  | 'onCallingTimeOut'
  | 'onCameraAvailable'
  | 'onAudioAvailable'
  | 'onUserNetworkQuality'
  | 'onCallTypeChange'
  | 'onCallEnd'
  | 'onDisconnect'
  | 'onUserDisconnect'
  | 'onOtherClientAccept'
  | 'onOtherClientReject'
  | 'onMessageSent'
  | 'onError';

export type ConnectStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTING';

export type Callback = {
  success?: () => void;
  failed?: RCallback;
};

export type SetupParams = {
  appKey: string;
  resolution?: 2 | 4 | 8 | 16;
  frameRate?: 1 | 2 | 3 | 4 | 5;
  quality?:
    | 'speech_low_quality'
    | 'speech_standard'
    | 'music_standard'
    | 'standard_stereo'
    | 'high_quality'
    | 'high_quality_stereo';
};

export type LoginParams = {
  account: string;
  token?: string;
} & Callback & {
    [key: string]: any;
  };

export type DeviceItem = {
  label: string;
  deviceId: string;
  active?: boolean;
};

export type Devices = {
  audioIn: DeviceItem[];
  audioOut: DeviceItem[];
  video: DeviceItem[];
};

export type DeviceType = 'microphoneId' | 'cameraId' | 'speakerId';

export type ChannelInfo = {
  ext?: string;
  channelId: string;
  channelName: string;
  type: CallType;
  createTimestamp: number; // 频道创建时间点
  expireTimestamp: number; // 频道失效时间点
  creatorId: string; // 频道创建者id
  invalid: boolean; // 频道是否有效
};

export type RoomInfo = {
  channelName: string;
  channelId: string;
  channelCreateTime: string;
  channelExpireTime: string;
  creator: string;
  members: Member[];
  uid: string;
};

export type MessageType =
  | 'complete'
  | 'canceled'
  | 'rejected'
  | 'timeout'
  | 'busy';

export enum CallingStatus {
  idle = 0, // 闲置
  calling = 1, // 正在呼叫
  called = 2, // 正在被呼叫
  inCall = 3, // 通话中
}

export type NetworkStats = {
  uid: string;
  uplinkNetworkQuality: number;
  downlinkNetworkQuality: number;
};

export type Duration = {
  accid: string;
  duration?: number;
};

export type BaseOptions = {
  debug: boolean;
};

export type InvitorChannelInfo = Pick<
  ChannelInfo,
  'channelId' | 'channelName' | 'creatorId'
> & { requestId: number; from: string; type: CallType };

export type Member = {
  uid: string; // 该成员在频道中对应的uid
  account: string; // 成员account账号
  createTimestamp?: number;
  expireTimestamp?: number;
};

export type PushInfo = {
  pushTitle: string;
  pushContent: string;
  pushPayload?: {};
  needPush: boolean;
  needBadge: boolean;
};

export type StreamConfig = {
  audio: boolean;
  video: boolean;
};

export type ChannelEvent = {
  eventType: string; // 这里应该是string，文档有误
  channelName: string;
  channelId: string;
  channelCreateTime: string;
  channelExpireTime: string;
  creator: string;
  from: string;
  attach: string;
  attachExt: string;
  time: number;
  members: Member[];
  pushInfo: PushInfo;
  requestId: number;
  to: string;
  channelInValid: boolean;
  type: CallType;
  msgid: number;
};

export type RTCEvent = {
  uid: string;
  stream: any;
  reason?: string;
};

export type TokenService = (uid: string) => Promise<string>;

// 信令相关
export interface SignallingCommon {
  login(params: LoginParams): Promise<void>;
  logout(params?: Callback): Promise<void>;
  call(
    params: {
      userId: string;
      type: CallType;
    } & Callback
  ): Promise<void>;
  groupCall(
    params: {
      userIds: string[];
      type: CallType;
      groupId?: string;
    } & Callback
  ): Promise<void>;
  cancel(params?: Callback): Promise<void>;
  accept(params?: Callback): Promise<void>;
  reject(params?: Callback): Promise<void>;
  hangup(params?: Callback): Promise<void>;
  leave(params?: Callback): Promise<void>;
  setCallTimeout(t: number): void;
}

// 音视频相关
export interface RTCCommon {
  setupAppKey(params: SetupParams): void;
  setTokenService(cb: TokenService): void;
  setupLocalView(view?: HTMLElement): void;
  setupRemoteView(userId: string, view?: HTMLElement): void;
  enableLocalVideo(enabled: boolean): Promise<void>;
  muteLocalAudio(mute: boolean): Promise<void>;
  selectSpeakers(deviceId: string): Promise<void>;
  getDevices(): Promise<Devices>;
  switchDevice(type: DeviceType, deviceId: string): Promise<void>;
  setAudioMute(mute: boolean, userId: string): Promise<void>;
}

export interface RTCControllerTypes extends RTCCommon {
  client: any;
  webrtc: any;
  appKey: string;
  joinRTCChannel(params: {
    channelName: string;
    type: CallType;
    uid: string;
  }): Promise<void>;
  initLocalStream(params: { type: CallType; uid: string }): Promise<void>;
  rtcSubscribe(stream: any, config: StreamConfig): Promise<void>;
  rtcUnSubscribe(stream: any, config: StreamConfig): Promise<void>;
  setupRemoteView(uid: string, view?: HTMLElement): void;
  rtcLeave(): Promise<void>;
  startStreamPreview(
    stream: any,
    type: 'local' | 'remote',
    view?: HTMLElement
  ): Promise<void>;
  enableLocalVideo(enabled: boolean, deviceId?: string): Promise<void>;
  muteLocalAudio(mute: boolean, deviceId?: string): Promise<void>;
  addStream(stream: any): void;
  updateStream(stream: any): void;
  removeStream(uid: string): void;
  findRemoteView(uid: string): HTMLElement | undefined;
  destroy(): void;
}
