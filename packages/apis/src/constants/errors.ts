import { ErrorMessage } from '../types/common';

export const UNKNOWN_ERROR: ErrorMessage = {
  code: '100',
  message: '未知错误',
};

export const DISCONNECT_FAILED: ErrorMessage = {
  code: '101',
  message: 'disconnect failed',
};

export const SIGNAL_NULL: ErrorMessage = {
  code: '102',
  message: 'signal is null',
};

export const CHANNELINFO_NULL: ErrorMessage = {
  code: '103',
  message: 'channelInfo is null',
};

export const CLIENT_NULL: ErrorMessage = {
  code: '104',
  message: 'client is null',
};

export const STREAM_NULL: ErrorMessage = {
  code: '105',
  message: 'stream is null',
};

export const CALLTYPE_NULL: ErrorMessage = {
  code: '106',
  message: 'callType is null',
};

export const INVITE_ALL_FAILED: ErrorMessage = {
  code: '107',
  message: 'invite all failed',
};

export const TIMEOUT: ErrorMessage = {
  code: '108',
  message: 'api timeout',
};

export const INVITE_PART_FAILED: ErrorMessage = {
  code: '109',
  message: 'groupInvite part failed',
};

export const CANCEL_PART_FAILED: ErrorMessage = {
  code: '110',
  message: 'cancel part failed',
};

export const SIGNAL_LEAVE_FAILED: ErrorMessage = {
  code: '111',
  message: 'signal leave failed',
};

export const RTC_LEAVE_FAILED: ErrorMessage = {
  code: '112',
  message: 'G2 RTC leave failed',
};

export const DURATIONS_EMPTY: ErrorMessage = {
  code: '113',
  message: 'durations is empty',
};

export const DEVICEID_NULL: ErrorMessage = {
  code: '114',
  message: 'deviceId is null',
};

export const INVITOR_CHANNELINFO_NULL: ErrorMessage = {
  code: '115',
  message: 'invotorChannelInfo is null',
};
