# NERtcCallKit-Web

该项目采用 monorepo 的方式进行多仓库管理

## 目录

- [api](packages/apis/README.md)：API 层，用户可以自行接入 UI
- [components](packages/apis/README.md)：组件层，已接入 UI，用户可直接使用

## 命令

在根目录封装了一些基础的命令，更多请参考[lerna](https://github.com/lerna/lerna)

### 安装所有 package 的依赖

```
npm run bootstrap
```

### 清除所有 package 的依赖

```
npm run clean
```

### 打包所有 package

```
npm run build
```

### 发布

```
npm run publish
```
