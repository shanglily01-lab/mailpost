# MailPost

用 Gmail SMTP 发信的本地工作台。完整步骤见 [docs/操作手册.md](docs/操作手册.md)。AWS Linux 部署（端口 5006）见 [docs/部署文档.md](docs/部署文档.md)。

```bash
npm install
npm run dev
```

打开 http://localhost:3000

生产启动：

```bash
npm run build
npm run start:prod
```

监听 `0.0.0.0:5006`。`data/mailpost.json` 含邮箱密钥，不要提交到 Git。
