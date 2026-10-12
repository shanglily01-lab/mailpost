from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import parse_xml
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

OUT = Path(__file__).resolve().parents[1] / "docs" / "MailPost-deploy.docx"
INK = RGBColor(0x1C, 0x19, 0x14)
MIST = RGBColor(0x5C, 0x51, 0x44)
AMBER = RGBColor(0x8A, 0x5A, 0x12)


def set_run_font(run, name="微软雅黑", size=11, bold=False, color=INK):
    run.bold = bold
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.name = name
    r = run._element.get_or_add_rPr()
    rFonts = r.get_or_add_rFonts()
    rFonts.set(qn("w:eastAsia"), name)
    rFonts.set(qn("w:ascii"), "Calibri")
    rFonts.set(qn("w:hAnsi"), "Calibri")


def add_heading(doc, text, level=1):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(16 if level == 1 else 12)
    p.paragraph_format.space_after = Pt(8)
    run = p.add_run(text)
    set_run_font(run, size=18 if level == 1 else 13, bold=True, color=INK if level == 1 else AMBER)


def add_body(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    run = p.add_run(text)
    set_run_font(run, size=11)


def add_mixed(doc, parts):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    for text, bold in parts:
        run = p.add_run(text)
        set_run_font(run, size=11, bold=bold)


def add_bullet(doc, text):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(3)
    run = p.add_run(text)
    set_run_font(run, size=11)


def add_number(doc, text):
    p = doc.add_paragraph(style="List Number")
    p.paragraph_format.space_after = Pt(3)
    run = p.add_run(text)
    set_run_font(run, size=11)


def add_code(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(8)
    run = p.add_run(text)
    set_run_font(run, name="Consolas", size=9)
    run.font.name = "Consolas"
    r = run._element.get_or_add_rPr()
    rFonts = r.get_or_add_rFonts()
    rFonts.set(qn("w:ascii"), "Consolas")
    rFonts.set(qn("w:hAnsi"), "Consolas")
    rFonts.set(qn("w:eastAsia"), "微软雅黑")
    shading = parse_xml(
        r'<w:shd xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:fill="F3EBE0"/>'
    )
    p._p.get_or_add_pPr().append(shading)


def add_table(doc, headers, rows):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = ""
        run = cell.paragraphs[0].add_run(h)
        set_run_font(run, size=10, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF))
        cell._tc.get_or_add_tcPr().append(
            parse_xml(
                r'<w:shd xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:fill="2A251E"/>'
            )
        )
    for r_i, row in enumerate(rows):
        for c_i, val in enumerate(row):
            cell = table.rows[r_i + 1].cells[c_i]
            cell.text = ""
            run = cell.paragraphs[0].add_run(val)
            set_run_font(run, size=10)
    doc.add_paragraph()


def main():
    doc = Document()
    for section in doc.sections:
        section.top_margin = Cm(2.2)
        section.bottom_margin = Cm(2.2)
        section.left_margin = Cm(2.4)
        section.right_margin = Cm(2.4)

    t = doc.add_paragraph().add_run("MailPost 部署文档")
    set_run_font(t, size=26, bold=True)
    s = doc.add_paragraph().add_run("AWS Linux  ·  监听端口 5006  ·  Gmail SMTP")
    set_run_font(s, size=12, color=MIST)

    add_body(
        doc,
        "把本机 MailPost 部署到 AWS Linux（建议 Amazon Linux 2023），对外端口 5006。本应用没有登录页：谁能打开 http://服务器:5006，谁就能用里面的 Gmail 发信。安全组务必只放行你的办公网 IP。",
    )

    add_heading(doc, "一、AWS 控制台准备")
    add_heading(doc, "1. 开一台 EC2", 2)
    add_bullet(doc, "系统：Amazon Linux 2023（Ubuntu 22.04 也可，见文末差异）")
    add_bullet(doc, "规格：t3.small 或以上。Next 构建建议 2GB 内存，1GB 容易 OOM")
    add_bullet(doc, "磁盘：20GB")
    add_bullet(doc, "下载 SSH 密钥 .pem")
    add_heading(doc, "2. 安全组", 2)
    add_table(
        doc,
        ["类型", "端口", "来源", "说明"],
        [
            ["SSH", "22", "你的公网 IP", "登录服务器"],
            ["自定义 TCP", "5006", "你的公网 IP", "打开 MailPost，不要 0.0.0.0/0"],
        ],
    )
    add_body(doc, "出站保持默认全部放行。发信必须能访问 smtp.gmail.com:587 以及 443（npm）。AWS 限制的是 25 端口，本系统用 587。若服务器上连不上 587，检查 VPC 出站或向 AWS 申请解除邮件限制。")
    add_heading(doc, "3. 弹性 IP", 2)
    add_body(doc, "给实例绑 Elastic IP，重启后地址不变。下文用 SERVER_IP 表示这个地址。")

    add_heading(doc, "二、本机打包上传")
    add_body(doc, "data/mailpost.json 含 Gmail 应用专用密码，不要提交公开 Git。部署时单独拷到服务器。")
    add_body(doc, "Windows PowerShell 示例（密钥路径按实际修改）：")
    add_code(
        doc,
        "icacls C:\\keys\\mailpost.pem /inheritance:r\n"
        "icacls C:\\keys\\mailpost.pem /grant:r \"$env:USERNAME:(R)\"\n"
        "ssh -i C:\\keys\\mailpost.pem ec2-user@SERVER_IP",
    )
    add_body(doc, "服务器上建目录：")
    add_code(doc, "sudo mkdir -p /opt/mailpost\nsudo chown ec2-user:ec2-user /opt/mailpost")
    add_body(doc, "本机上传代码（不要传 node_modules、.next）：")
    add_code(
        doc,
        "cd d:\\mailpost\n"
        "scp -i C:\\keys\\mailpost.pem -r src ec2-user@SERVER_IP:/opt/mailpost/\n"
        "scp -i C:\\keys\\mailpost.pem package.json package-lock.json next.config.ts tsconfig.json ec2-user@SERVER_IP:/opt/mailpost/\n"
        "scp -i C:\\keys\\mailpost.pem docs\\mailpost.service ec2-user@SERVER_IP:/opt/mailpost/",
    )
    add_body(doc, "若本机已接入 Gmail，再传数据文件：")
    add_code(
        doc,
        "ssh -i C:\\keys\\mailpost.pem ec2-user@SERVER_IP \"mkdir -p /opt/mailpost/data\"\n"
        "scp -i C:\\keys\\mailpost.pem d:\\mailpost\\data\\mailpost.json ec2-user@SERVER_IP:/opt/mailpost/data/",
    )

    add_heading(doc, "三、服务器安装 Node 并构建")
    add_body(doc, "Amazon Linux 2023：")
    add_code(
        doc,
        "sudo dnf update -y\n"
        "sudo dnf install -y gcc-c++ make tar git\n"
        "curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -\n"
        "sudo dnf install -y nodejs\n"
        "node -v",
    )
    add_body(doc, "构建：")
    add_code(doc, "cd /opt/mailpost\nnpm ci\nnpm run build")
    add_body(doc, "若构建被 Killed，加 2G 交换分区后再构建：")
    add_code(
        doc,
        "sudo dd if=/dev/zero of=/swapfile bs=1M count=2048\n"
        "sudo chmod 600 /swapfile\n"
        "sudo mkswap /swapfile\n"
        "sudo swapon /swapfile",
    )
    add_code(
        doc,
        "mkdir -p /opt/mailpost/data /opt/mailpost/data/outbox\n"
        "chmod 700 /opt/mailpost/data\n"
        "chmod 600 /opt/mailpost/data/mailpost.json",
    )
    add_body(doc, "先手动试跑：cd /opt/mailpost && npm run start:prod")
    add_body(doc, "本机浏览器打开 http://SERVER_IP:5006 能看到写信页即成功。Ctrl+C 停掉，改由 systemd 托管。")

    add_heading(doc, "四、systemd 常驻（开机自启）")
    add_code(
        doc,
        "sudo cp /opt/mailpost/docs/mailpost.service /etc/systemd/system/mailpost.service\n"
        "sudo systemctl daemon-reload\n"
        "sudo systemctl enable mailpost\n"
        "sudo systemctl start mailpost\n"
        "sudo systemctl status mailpost",
    )
    add_body(doc, "若系统用户不是 ec2-user（Ubuntu 为 ubuntu），改 service 文件里的 User=。")
    add_code(doc, "sudo journalctl -u mailpost -f\nsudo systemctl restart mailpost\nss -lntp | grep 5006")

    add_heading(doc, "五、上线后立刻做")
    add_number(doc, "打开 http://SERVER_IP:5006/compliance ，把「站点（退订链接）」改成 http://SERVER_IP:5006 （有 HTTPS 域名则填 https://域名）。不改的话退订链接仍是 localhost。")
    add_number(doc, "Gmail 页确认发件箱还在。没传 mailpost.json 就在服务器上重新接入应用专用密码。")
    add_body(doc, "测出站 SMTP：")
    add_code(doc, "timeout 5 bash -c 'echo >/dev/tcp/smtp.gmail.com/587' && echo OK || echo FAIL")

    add_heading(doc, "六、以后如何更新代码")
    add_body(doc, "不要覆盖 data/mailpost.json。联系人、Gmail 密码、话术都在这个文件里。")
    add_code(doc, "cd /opt/mailpost\n# git pull 或本机再 scp src\nnpm ci\nnpm run build\nsudo systemctl restart mailpost")
    add_code(doc, "cp /opt/mailpost/data/mailpost.json /opt/mailpost/data/mailpost.json.bak-$(date +%F)")

    add_heading(doc, "七、故障排查")
    add_table(
        doc,
        ["现象", "处理"],
        [
            ["浏览器打不开", "安全组是否放行 5006；systemctl status；ss 看是否 0.0.0.0:5006"],
            ["发信 Connection closed", "实例访问 smtp.gmail.com:587 被拦"],
            ["Invalid login", "应用专用密码错或已撤销"],
            ["构建被 Killed", "内存不够，加 swap 或换更大实例"],
            ["更新后数据没了", "覆盖了 data/mailpost.json，从备份恢复"],
            ["退订链接是 localhost", "设置页改成 http://SERVER_IP:5006"],
        ],
    )

    add_heading(doc, "八、Ubuntu 与安全")
    add_body(doc, "Ubuntu 用户一般是 ubuntu。安装 Node：curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - 然后 apt 安装 nodejs。systemd 里 User=ubuntu。")
    add_bullet(doc, "安全组 5006 只放行你的 IP。")
    add_bullet(doc, "mailpost.json 权限 600，不要打进公开镜像或公开 Git。")
    add_bullet(doc, "必须公网访问时，前面加 Nginx + HTTPS + 基本认证或 VPN，Node 只绑 127.0.0.1:5006。")

    doc.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
