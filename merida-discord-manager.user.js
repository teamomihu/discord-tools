// ==UserScript==
// @name         Merida Discord 全能管理脚本
// @namespace    https://github.com/merida/discord-manager
// @version      1.2.1
// @description  Discord 游戏频道管理三合一：一键翻译(看) + 游戏黑话(说) + 关键词预警(管)
// @author       Merida
// @match        https://discord.com/*
// @match        https://discordapp.com/*
// @match        https://*.discord.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @connect      translate.googleapis.com
// @connect      generativelanguage.googleapis.com
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  console.log("%c[Merida] 脚本已注入，等待页面加载...", "color:#7289da;font-size:14px;font-weight:bold;");

  // ============================================================
  //  第0层：全局配置系统
  // ============================================================
  const CONFIG = {
    // ---------- 模块1「看」翻译 ----------
    translateMode: "auto", // "auto" = 自动翻译 | "manual" = 点击按钮翻译

    // ---------- Gemini AI 回复 ----------
    geminiApiKey: "", // 留空则用预设话术，填了则用 AI 生成回复

    // ---------- 模块2「说」黑话词库 ----------
    slangDict: {
      categories: [
        {
          id: "pk",
          name: "PK / 战斗",
          icon: "⚔️",
          items: [
            { zh: "来PK", en: "Anyone down for a PK? Room is ready! ⚔️" },
            { zh: "集火那个奶妈", en: "Focus the healer! Burn her down! 🔥" },
            { zh: "拉人来帮忙", en: "Need backup ASAP! Come help! 🆘" },
            { zh: "他开挂了", en: "This guy is clearly hacking, report him! 🚫" },
            { zh: "打不过跑路", en: "Can't win this one, falling back! 🏃" },
            { zh: "等我复活", en: "Wait for me, respawning in a sec! ⏳" },
            { zh: "这波稳了", en: "We got this! Easy clap! 💪" },
            { zh: "别送了", en: "Stop feeding! Play safe! 🛡️" },
          ],
        },
        {
          id: "team",
          name: "组队 / 副本",
          icon: "🎮",
          items: [
            { zh: "组队刷副本", en: "LFG for dungeon run! Who's in? 🎮" },
            { zh: "缺一个T", en: "Need 1 tank, then we're good to go! 🛡️" },
            { zh: "缺奶妈", en: "LF healer for our party! 💚" },
            { zh: "带我一个", en: "Can I join? I'm geared and ready! ✋" },
            { zh: "开始了吗", en: "Are we starting? Ready check! ✅" },
            { zh: "有人要一起打Boss吗", en: "Anyone wanna raid the boss together? 👊" },
            { zh: "我装备够了", en: "My gear score is high enough, let's go! 📊" },
            { zh: "这个副本多久", en: "How long does this dungeon take? ⏰" },
          ],
        },
        {
          id: "social",
          name: "社交 / 日常",
          icon: "💬",
          items: [
            { zh: "大家好", en: "Hey everyone! What's up? 👋" },
            { zh: "有人在吗", en: "Anyone online? 🔔" },
            { zh: "我先下了", en: "Gotta go, catch you all later! ✌️" },
            { zh: "谢谢大佬", en: "Thanks a lot, you're a legend! 🙏" },
            { zh: "牛逼", en: "That's insane! GG! 🔥" },
            { zh: "加我好友", en: "Add me as a friend! Let's play together! 🤝" },
            { zh: "今天更新了吗", en: "Did the game update today? Any patch notes? 📋" },
            { zh: "服务器炸了", en: "Server's down again... anyone else lagging? 💀" },
          ],
        },
        {
          id: "trade",
          name: "交易 / 市场",
          icon: "💰",
          items: [
            { zh: "收金币", en: "WTB gold, PM me your price! 💰" },
            { zh: "卖装备", en: "WTS epic gear, whisper me for details! 🏷️" },
            { zh: "多少钱", en: "How much for that? Price check! 💵" },
            { zh: "可以便宜点吗", en: "Can you lower the price a bit? 🤔" },
            { zh: "成交", en: "Deal! Let's trade! 🤝" },
          ],
        },
        {
          id: "custom",
          name: "自定义",
          icon: "✏️",
          items: [],
        },
      ],
    },

    // ---------- 模块3「管」关键词预警 ----------
    alertKeywords: [
      "scam", "hack", "cheat", "exploit", "ban",
      "phishing", "malware", "virus", "steal", "fraud",
      "fake", "bot", "spam", "nsfw", "leak",
    ],
    alertEnabled: true,
    alertDesktopNotify: true, // 是否弹桌面通知

    // ---------- 加载/保存 ----------
    async load() {
      this.translateMode = await GM_getValue("translateMode", this.translateMode);
      this.geminiApiKey = await GM_getValue("geminiApiKey", this.geminiApiKey);
      const savedDict = await GM_getValue("slangDict", null);
      if (savedDict) {
        // 合并：保留内置词库，覆盖自定义分类
        const customCat = savedDict.categories?.find((c) => c.id === "custom");
        if (customCat) {
          const builtinCat = this.slangDict.categories.find((c) => c.id === "custom");
          if (builtinCat) builtinCat.items = customCat.items;
        }
      }
      const savedKeywords = await GM_getValue("alertKeywords", null);
      if (savedKeywords) this.alertKeywords = savedKeywords;
      this.alertEnabled = await GM_getValue("alertEnabled", true);
      this.alertDesktopNotify = await GM_getValue("alertDesktopNotify", true);
    },
    async save(key, value) {
      this[key] = value;
      await GM_setValue(key, value);
    },
  };

  // ============================================================
  //  第1层：工具函数
  // ============================================================
  const Utils = {
    // 模糊匹配 Discord 动态类名：匹配 class 属性中包含指定前缀的元素
    qs(prefix, parent = document) {
      return parent.querySelector(`[class*="${prefix}"]`);
    },
    qsa(prefix, parent = document) {
      return parent.querySelectorAll(`[class*="${prefix}"]`);
    },

    // 防抖
    debounce(fn, ms = 200) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
      };
    },

    // 创建带样式的元素
    el(tag, attrs = {}, children = []) {
      const node = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === "style" && typeof v === "object") {
          Object.assign(node.style, v);
        } else if (k === "className") {
          node.className = v;
        } else if (k.startsWith("on")) {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else {
          node.setAttribute(k, v);
        }
      });
      children.forEach((c) => {
        if (typeof c === "string") node.appendChild(document.createTextNode(c));
        else if (c) node.appendChild(c);
      });
      return node;
    },

    // 找到节点所属的消息 li；若节点是包裹多条消息的容器则返回全部
    messageItemsFrom(node) {
      if (!node) return [];
      const el =
        node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!(el instanceof HTMLElement)) return [];
      if (this.isMeridaEl(el)) return [];
      if (el.matches('[class*="messageListItem_"]')) return [el];
      const inside = el.closest('[class*="messageListItem_"]');
      if (inside) return [inside];
      if (el.querySelector?.('[class*="messageListItem_"]')) {
        return [...el.querySelectorAll('[class*="messageListItem_"]')];
      }
      return [];
    },

    isMeridaEl(el) {
      if (!(el instanceof HTMLElement)) return false;
      if ([...el.classList].some((c) => c.startsWith("merida-"))) return true;
      return !!el.closest?.(
        ".merida-translation, .merida-translate-link, .merida-reply-link, .merida-reply-panel, .merida-toast, .merida-header-btn, .merida-alert-badge"
      );
    },

    // 翻译图标 SVG
    translateSVG() {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "20");
      svg.setAttribute("height", "20");
      svg.setAttribute("viewBox", "0 0 512 512");
      svg.setAttribute("fill", "currentColor");
      svg.innerHTML = `<path d="M478.33,433.6l-90-218a22,22,0,0,0-40.67,0l-90,218a22,22,0,1,0,40.67,16.79L316.66,406H419.33l18.33,44.39A22,22,0,0,0,458,464a22,22,0,0,0,20.32-30.4ZM334.83,362,368,281.65,401.17,362Z"/><path d="M267.84,342.92a22,22,0,0,0-4.89-30.7c-.2-.15-15-11.13-36.49-34.73,39.65-53.68,62.11-114.75,71.27-143.49H330a22,22,0,0,0,0-44H214V70a22,22,0,0,0-44,0V90H54a22,22,0,0,0,0,44H251.25c-9.52,26.95-27.05,69.5-53.79,108.36-31.41-41.68-43.08-68.65-43.17-68.87a22,22,0,0,0-40.58,17c.58,1.38,14.55,34.23,52.86,83.93.92,1.19,1.83,2.35,2.74,3.51-39.24,44.35-77.74,71.86-93.85,80.74a22,22,0,1,0,21.07,38.63c2.16-1.18,48.6-26.89,101.63-85.59,22.52,24.08,38,35.44,38.93,36.1a22,22,0,0,0,30.75-4.9Z"/>`;
      return svg;
    },
  };

  // ============================================================
  //  第2层：注入全局 CSS 样式
  // ============================================================
  GM_addStyle(`
    /* ---- 模块3「管」关键词预警高亮 ---- */
    .merida-alert-highlight {
      background: rgba(255, 60, 60, 0.12) !important;
      border-left: 3px solid #ff4444 !important;
      border-radius: 0 4px 4px 0;
      padding-left: 6px !important;
      transition: background 0.3s ease;
    }
    .merida-alert-badge {
      display: inline-block;
      background: #ff4444;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: 6px;
      vertical-align: middle;
      cursor: help;
    }

    /* ---- 模块1「看」翻译结果 ---- */
    .merida-translation {
      margin-top: 6px;
      padding: 6px 10px;
      background: rgba(114, 137, 218, 0.08);
      border-left: 3px solid #7289da;
      border-radius: 0 4px 4px 0;
      color: #72d4a3;
      font-size: 0.9em;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .merida-translation-label {
      font-size: 0.75em;
      color: #999;
      margin-bottom: 2px;
    }

    /* ---- 翻译按钮（手动模式，注入到消息悬浮工具栏） ---- */
    .merida-translate-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      color: #b9bbbe;
      transition: color 0.15s, background 0.15s;
    }
    .merida-translate-btn:hover {
      color: #fff;
      background: rgba(255,255,255,0.1);
    }
    .merida-translate-btn.loading {
      pointer-events: none;
      opacity: 0.4;
    }
    /* ---- 内联翻译链接（未翻译消息下方） ---- */
    .merida-translate-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #7289da;
      font-size: 12px;
      cursor: pointer;
      margin-top: 4px;
      padding: 2px 6px;
      border-radius: 3px;
      transition: background 0.15s, color 0.15s;
      user-select: none;
    }
    .merida-translate-link:hover {
      background: rgba(114, 137, 218, 0.15);
      color: #fff;
    }
    .merida-translate-link.loading {
      opacity: 0.5;
      pointer-events: none;
    }
    .merida-translate-link svg {
      width: 14px;
      height: 14px;
    }

    /* ---- 建议回复按钮 ---- */
    .merida-reply-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #faa61a;
      font-size: 12px;
      cursor: pointer;
      margin-top: 4px;
      margin-left: 8px;
      padding: 2px 6px;
      border-radius: 3px;
      transition: background 0.15s, color 0.15s;
      user-select: none;
    }
    .merida-reply-link:hover {
      background: rgba(250, 166, 26, 0.15);
      color: #fff;
    }

    /* ---- 建议回复下拉面板 ---- */
    .merida-reply-panel {
      background: #2f3136;
      border: 1px solid #40444b;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      margin-top: 6px;
      max-height: 300px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .merida-reply-tabs {
      display: flex;
      border-bottom: 1px solid #40444b;
      overflow-x: auto;
      flex-shrink: 0;
      padding: 0 4px;
    }
    .merida-reply-tab {
      padding: 6px 10px;
      cursor: pointer;
      color: #999;
      font-size: 12px;
      white-space: nowrap;
      border-bottom: 2px solid transparent;
      transition: color 0.2s, border-color 0.2s;
    }
    .merida-reply-tab:hover { color: #dcddde; }
    .merida-reply-tab.active {
      color: #faa61a;
      border-bottom-color: #faa61a;
    }
    .merida-reply-items {
      overflow-y: auto;
      padding: 4px;
      flex: 1;
    }
    .merida-reply-item {
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s;
      margin-bottom: 2px;
    }
    .merida-reply-item:hover {
      background: rgba(250, 166, 26, 0.12);
    }
    .merida-reply-item-en {
      color: #fff;
      font-size: 13px;
    }
    .merida-reply-item-zh {
      color: #faa61a;
      font-size: 11px;
      margin-top: 2px;
      opacity: 0.8;
    }
    /* ---- 复制按钮 ---- */
    .merida-reply-item-row {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .merida-reply-item-text {
      flex: 1;
      min-width: 0;
    }
    .merida-copy-btn {
      flex-shrink: 0;
      background: #40444b;
      border: none;
      color: #b9bbbe;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 3px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s, color 0.15s;
      margin-top: 2px;
    }
    .merida-copy-btn:hover {
      background: #7289da;
      color: #fff;
    }
    .merida-copy-btn.copied {
      background: #43b581;
      color: #fff;
    }
    /* ---- AI 生成状态 ---- */
    .merida-ai-loading {
      color: #999;
      font-size: 13px;
      padding: 20px;
      text-align: center;
    }
    .merida-ai-tab {
      background: linear-gradient(90deg, #faa61a, #f04747);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-weight: 700;
    }

    /* ---- 模块2「说」黑话面板 ---- */
    .merida-slang-panel {
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      margin-bottom: 4px;
      background: #2f3136;
      border: 1px solid #40444b;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      z-index: 9999;
      max-height: 360px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .merida-slang-tabs {
      display: flex;
      border-bottom: 1px solid #40444b;
      overflow-x: auto;
      flex-shrink: 0;
      padding: 0 4px;
    }
    .merida-slang-tab {
      padding: 8px 12px;
      cursor: pointer;
      color: #999;
      font-size: 13px;
      white-space: nowrap;
      border-bottom: 2px solid transparent;
      transition: color 0.2s, border-color 0.2s;
    }
    .merida-slang-tab:hover { color: #dcddde; }
    .merida-slang-tab.active {
      color: #fff;
      border-bottom-color: #7289da;
    }
    .merida-slang-items {
      overflow-y: auto;
      padding: 6px;
      flex: 1;
    }
    .merida-slang-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 7px 10px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s;
      margin-bottom: 2px;
    }
    .merida-slang-item:hover {
      background: rgba(114, 137, 218, 0.15);
    }
    .merida-slang-zh {
      color: #fff;
      font-size: 13px;
      font-weight: 500;
    }
    .merida-slang-en {
      color: #72d4a3;
      font-size: 12px;
      margin-left: 12px;
      text-align: right;
      max-width: 60%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .merida-slang-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      color: #b9bbbe;
      background: transparent;
      border: none;
      font-size: 18px;
      transition: color 0.15s, background 0.15s;
    }
    .merida-slang-toggle:hover {
      color: #fff;
      background: rgba(255,255,255,0.1);
    }
    .merida-slang-toggle.active {
      color: #7289da;
    }

    /* ---- 设置面板 ---- */
    .merida-settings-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .merida-settings-panel {
      background: #36393f;
      border-radius: 8px;
      width: 520px;
      max-height: 80vh;
      overflow-y: auto;
      padding: 24px;
      color: #dcddde;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5);
    }
    .merida-settings-panel h2 {
      color: #fff;
      margin: 0 0 16px 0;
      font-size: 18px;
    }
    .merida-settings-panel h3 {
      color: #7289da;
      font-size: 14px;
      text-transform: uppercase;
      margin: 16px 0 8px 0;
    }
    .merida-settings-panel label {
      display: block;
      font-size: 13px;
      margin-bottom: 4px;
      color: #b9bbbe;
    }
    .merida-settings-panel input[type="text"],
    .merida-settings-panel textarea {
      width: 100%;
      padding: 8px;
      background: #2f3136;
      border: 1px solid #40444b;
      border-radius: 4px;
      color: #fff;
      font-size: 13px;
      margin-bottom: 10px;
      box-sizing: border-box;
    }
    .merida-settings-panel textarea { resize: vertical; min-height: 60px; }
    .merida-settings-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: opacity 0.2s;
    }
    .merida-settings-btn:hover { opacity: 0.85; }
    .merida-settings-btn.primary { background: #7289da; color: #fff; }
    .merida-settings-btn.danger  { background: #f04747; color: #fff; }
    .merida-settings-btn.ghost   { background: transparent; color: #b9bbbe; }

    /* ---- 顶部工具栏按钮 ---- */
    .merida-header-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      color: #b9bbbe;
      background: transparent;
      border: none;
      transition: color 0.15s, background 0.15s;
    }
    .merida-header-btn:hover {
      color: #fff;
      background: rgba(255,255,255,0.1);
    }

    /* ---- Toast 提示 ---- */
    .merida-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #2f3136;
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      z-index: 999999;
      font-size: 13px;
      animation: merida-toast-in 0.3s ease;
    }
    @keyframes merida-toast-in {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `);

  // ============================================================
  //  第3层：模块3「管」关键词预警 (The Guard)
  // ============================================================
  const Guard = {
    _processed: new WeakSet(),

    // 构建正则
    _buildRegex() {
      if (!CONFIG.alertKeywords.length) return null;
      const escaped = CONFIG.alertKeywords.map(
        (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      );
      return new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
    },

    // 扫描单条消息
    scanMessage(msgNode) {
      if (!CONFIG.alertEnabled) return;
      if (this._processed.has(msgNode)) return;
      this._processed.add(msgNode);

      const regex = this._buildRegex();
      if (!regex) return;

      // 查找消息文本容器（跳过回复引用区）
      const allContent = msgNode.querySelectorAll('[class*="messageContent_"], [class*="markup_"]');
      const markupEl = [...allContent].filter(
        (el) => !el.closest('[class*="repliedMessage_"]') && !el.closest('[class*="referencedMessage_"]')
      ).pop();
      if (!markupEl) return;

      const text = markupEl.textContent || "";
      const matches = text.match(regex);
      if (!matches || matches.length === 0) return;

      // 高亮整条消息
      const msgWrapper =
        msgNode.closest('[class*="message_"]') ||
        msgNode.closest("li") ||
        msgNode;
      msgWrapper.classList.add("merida-alert-highlight");

      // 添加警告标记
      if (!markupEl.querySelector(".merida-alert-badge")) {
        const uniqueWords = [...new Set(matches.map((m) => m.toLowerCase()))];
        const badge = Utils.el(
          "span",
          {
            className: "merida-alert-badge",
            title: `检测到敏感词: ${uniqueWords.join(", ")}`,
          },
          [`⚠ ${uniqueWords.join(", ")}`]
        );
        markupEl.appendChild(badge);
      }

      // 桌面通知
      if (CONFIG.alertDesktopNotify) {
        const uniqueWords = [...new Set(matches.map((m) => m.toLowerCase()))];
        GM_notification({
          title: "⚠️ Discord 关键词预警",
          text: `检测到: ${uniqueWords.join(", ")}\n${text.slice(0, 80)}...`,
          timeout: 5000,
        });
      }
    },

    // 扫描页面上所有现有消息（首次加载时）
    scanAll() {
      const msgs = Utils.qsa("messageListItem_");
      msgs.forEach((m) => this.scanMessage(m));
    },
  };

  // ============================================================
  //  第4层：模块1「看」自动翻译 (The Vision)
  //  所有非中文消息自动在原文下方显示中文翻译
  // ============================================================
  const Vision = {
    _lastText: new WeakMap(),   // msgNode -> 上次用于翻译的原文（文本变了或翻译节点丢了就重翻）
    _queue: [],                 // 翻译队列
    _running: false,            // 队列是否正在处理
    _concurrency: 4,            // 同时最多几个翻译请求（提高到4）
    _activeCount: 0,
    _debounce: new WeakMap(),   // msgNode -> 编辑/重绘防抖 timer

    // 查找消息的真正内容元素（跳过回复引用区）
    _findContentEl(msgNode) {
      const allContent = msgNode.querySelectorAll('[class*="messageContent_"], [class*="markup_"]');
      // 过滤掉在引用区（repliedMessage / referencedMessage）里的元素
      const filtered = [...allContent].filter(
        (el) => !el.closest('[class*="repliedMessage_"]') && !el.closest('[class*="referencedMessage_"]')
      );
      // 返回最后一个匹配的（回复消息中，真正的内容在引用区后面）
      return filtered.length > 0 ? filtered[filtered.length - 1] : null;
    },

    // Discord 正在编辑这条消息时，内部会出现输入框，不要拿半成品去翻
    _isEditing(msgNode) {
      if (!msgNode) return false;
      return !!(
        msgNode.querySelector('[class*="channelTextArea_"]') ||
        msgNode.querySelector('[class*="operations_"]') ||
        msgNode.querySelector("textarea") ||
        msgNode.querySelector('[class*="textAreaSlate"]') ||
        msgNode.querySelector('[class*="editor_"] [role="textbox"]')
      );
    },

    // 提取用于翻译的纯文本：去掉「已编辑」标记和脚本自己插入的节点
    _extractText(contentEl) {
      if (!contentEl) return "";
      const clone = contentEl.cloneNode(true);
      clone
        .querySelectorAll(
          [
            ".merida-translation",
            ".merida-translate-link",
            ".merida-reply-link",
            ".merida-reply-panel",
            ".merida-alert-badge",
            '[class*="edited_"]',
            '[class*="timestamp_"]',
          ].join(",")
        )
        .forEach((el) => el.remove());
      return (clone.textContent || "").replace(/\s+/g, " ").trim();
    },

    // 消息内容可能被 Discord 重绘（编辑保存、虚拟列表回收），防抖后再决定是否重翻
    scheduleRefresh(msgNode) {
      if (!msgNode) return;
      const prev = this._debounce.get(msgNode);
      if (prev) clearTimeout(prev);
      const t = setTimeout(() => {
        this._debounce.delete(msgNode);
        if (!msgNode.isConnected) return;
        if (this._isEditing(msgNode)) return;
        if (CONFIG.translateMode === "auto") this.autoTranslate(msgNode);
        this.addTranslateLink(msgNode);
        SmartReply.addReplyButton(msgNode);
      }, 350);
      this._debounce.set(msgNode, t);
    },

    // 检测文本是否主要为中文（超过 40% 中文字符则跳过翻译）
    isChinese(text) {
      if (!text || text.length < 2) return false;
      const stripped = text.replace(/[\s\d\p{P}\p{S}]/gu, ""); // 去除空白/数字/标点/符号
      if (stripped.length === 0) return false;
      const cjk = stripped.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
      return cjk && cjk.length / stripped.length > 0.4;
    },

    // 调用 Google 翻译（免费非官方接口），所有语言 -> 中文
    translate(text) {
      return new Promise((resolve, reject) => {
        const url =
          `https://translate.googleapis.com/translate_a/single` +
          `?client=gtx&sl=auto&tl=zh-CN&dt=t&dt=ld&q=${encodeURIComponent(text)}`;

        GM_xmlhttpRequest({
          method: "GET",
          url,
          onload(resp) {
            try {
              const data = JSON.parse(resp.responseText);
              // data[0] 是翻译结果数组
              const translated = data[0]
                .map((seg) => seg[0])
                .filter(Boolean)
                .join("");
              // data[2] 是检测到的源语言代码（如 "en", "ja", "ko"）
              const detectedLang = data[2] || "auto";
              resolve({ text: translated, lang: detectedLang });
            } catch (e) {
              reject(new Error("翻译解析失败: " + e.message));
            }
          },
          onerror(err) {
            reject(new Error("翻译请求失败: " + (err.statusText || "网络错误")));
          },
        });
      });
    },

    // 语言代码 -> 中文名
    langName(code) {
      const map = {
        en: "英语", ja: "日语", ko: "韩语", fr: "法语", de: "德语",
        es: "西班牙语", pt: "葡萄牙语", ru: "俄语", ar: "阿拉伯语",
        th: "泰语", vi: "越南语", id: "印尼语", ms: "马来语",
        it: "意大利语", nl: "荷兰语", pl: "波兰语", tr: "土耳其语",
        uk: "乌克兰语", hi: "印地语", zh: "中文",
      };
      return map[code] || code;
    },

    // 自动翻译单条消息。同一条 li 被编辑或翻译节点被 Discord 清掉时会重翻。
    async autoTranslate(msgNode) {
      if (!msgNode?.isConnected) return;
      if (this._isEditing(msgNode)) return;

      const contentEl = this._findContentEl(msgNode);
      if (!contentEl) return;

      const text = this._extractText(contentEl);
      if (!text || text.length < 2) return;

      // 跳过已经是中文的消息；若之前有翻译（例如改成了中文）则清掉
      if (this.isChinese(text)) {
        msgNode.querySelector(".merida-translation")?.remove();
        this._lastText.set(msgNode, text);
        return;
      }

      // 跳过纯表情/纯链接
      if (/^(https?:\/\/\S+\s*)+$/.test(text)) return;
      if (/^[\p{Emoji}\s]+$/u.test(text)) return;

      const existing = msgNode.querySelector(".merida-translation");
      const last = this._lastText.get(msgNode);
      if (existing && last === text) return;

      if (existing && last !== text) existing.remove();

      this._lastText.set(msgNode, text);
      this._queue.push({ msgNode, text });
      this._processQueue();
    },

    // 处理翻译队列（控制并发，防止请求爆炸）
    async _processQueue() {
      while (this._queue.length > 0 && this._activeCount < this._concurrency) {
        const job = this._queue.shift();
        if (!job) break;
        this._activeCount++;

        // 延迟 150ms 错开请求
        await new Promise((r) => setTimeout(r, 150));

        this._doTranslate(job).finally(() => {
          this._activeCount--;
          this._processQueue(); // 继续处理下一个
        });
      }
    },

    async _doTranslate({ msgNode, text }) {
      try {
        if (!msgNode.isConnected) return;
        if (this._isEditing(msgNode)) return;

        const contentEl = this._findContentEl(msgNode);
        if (!contentEl) return;

        const liveText = this._extractText(contentEl);
        if (liveText && liveText !== text) return;

        if (msgNode.querySelector(".merida-translation")) return;

        const result = await this.translate(text);

        if (!msgNode.isConnected) return;
        if (this._isEditing(msgNode)) return;

        // 如果 Google 检测到源语言就是中文，跳过
        if (result.lang === "zh-CN" || result.lang === "zh-TW" || result.lang === "zh") return;
        // 如果翻译结果和原文一样，跳过
        if (result.text.trim() === text.trim()) return;

        const liveEl = this._findContentEl(msgNode);
        if (!liveEl?.parentNode) return;
        if (msgNode.querySelector(".merida-translation")) return;

        const langLabel = this.langName(result.lang);
        const transDiv = Utils.el(
          "div",
          { className: "merida-translation" },
          [
            Utils.el("div", { className: "merida-translation-label" }, [
              `🌐 ${langLabel} → 中文`,
            ]),
            result.text,
          ]
        );
        msgNode.querySelector(".merida-translate-link")?.remove();
        liveEl.parentNode.insertBefore(transDiv, liveEl.nextSibling);
      } catch (err) {
        console.warn("[Merida] 翻译失败:", text.slice(0, 30), err.message);
        // 失败时清掉记录，后续 mutation 可以重试
        if (this._lastText.get(msgNode) === text) this._lastText.delete(msgNode);
      }
    },

    // 扫描页面上所有已有消息（自动模式）
    scanAll() {
      if (CONFIG.translateMode !== "auto") return;
      const msgs = Utils.qsa("messageListItem_");
      msgs.forEach((m) => this.autoTranslate(m));
    },

    // ---- 以下为手动模式（点击按钮翻译） ----

    // 对单条消息执行翻译（手动触发）
    async manualTranslate(msgContainer) {
      const contentEl = this._findContentEl(msgContainer);
      if (!contentEl) return;

      const text = this._extractText(contentEl);
      if (!text) return;

      // 已有翻译则切换显示/隐藏
      const existing = msgContainer.querySelector(".merida-translation");
      if (existing) {
        existing.remove();
        return;
      }

      try {
        const result = await this.translate(text);
        if (msgContainer.querySelector(".merida-translation")) return;

        // 如果翻译结果和原文相同，提示已是中文
        if (result.text.trim() === text.trim()) {
          showToast("这条消息已经是中文了");
          return;
        }

        const langLabel = this.langName(result.lang);
        const transDiv = Utils.el(
          "div",
          { className: "merida-translation" },
          [
            Utils.el("div", { className: "merida-translation-label" }, [
              `🌐 ${langLabel} → 中文`,
            ]),
            result.text,
          ]
        );
        contentEl.parentNode.insertBefore(transDiv, contentEl.nextSibling);
      } catch (err) {
        console.error("[Merida] 翻译失败:", err);
        showToast("翻译失败: " + err.message);
      }
    },

    // 给未翻译的消息加「点击翻译」内联链接
    addTranslateLink(msgNode) {
      if (msgNode.querySelector(".merida-translate-link")) return;
      if (msgNode.querySelector(".merida-translation")) return;

      const contentEl = this._findContentEl(msgNode);
      if (!contentEl) return;

      const text = this._extractText(contentEl);
      if (!text || text.length < 2) return;
      if (this.isChinese(text)) return;
      if (/^(https?:\/\/\S+\s*)+$/.test(text)) return;
      if (/^[\p{Emoji}\s]+$/u.test(text)) return;

      const link = Utils.el("div", { className: "merida-translate-link" }, [
        "🌐 点击翻译",
      ]);

      link.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (link.classList.contains("loading")) return;
        link.classList.add("loading");
        link.textContent = "🌐 翻译中...";
        try {
          await this.manualTranslate(msgNode);
          link.remove(); // 翻译成功后移除链接
        } catch (err) {
          link.classList.remove("loading");
          link.textContent = "🌐 重试翻译";
        }
      });

      contentEl.parentNode.insertBefore(link, contentEl.nextSibling);
    },

    // 扫描所有消息，给没翻译的加链接
    addLinksToAll() {
      const msgs = document.querySelectorAll('[class*="messageListItem_"]');
      msgs.forEach((m) => this.addTranslateLink(m));
    },
  };

  // ============================================================
  //  第4.5层：建议回复 (Smart Reply)
  // ============================================================
  const SmartReply = {
    // 回复话术库（中英对照）
    templates: [
      {
        id: "agree",
        name: "👍 赞同",
        items: [
          { en: "Totally agree with you! Well said! 👏", zh: "完全同意你说的！说得好！" },
          { en: "100% this. You nailed it! 🎯", zh: "百分之百同意，你说到点子上了！" },
          { en: "Couldn't have said it better myself!", zh: "我自己都说不出更好的了！" },
          { en: "Facts! This is exactly what I was thinking.", zh: "没错！我也是这么想的。" },
          { en: "Big facts. You're absolutely right. 💯", zh: "大实话，你说得对极了。" },
        ],
      },
      {
        id: "thanks",
        name: "🙏 感谢",
        items: [
          { en: "Thanks so much for sharing this! Really helpful! 🙏", zh: "非常感谢你分享这个！真的很有帮助！" },
          { en: "Appreciate the feedback! We'll definitely look into it.", zh: "感谢反馈！我们一定会跟进的。" },
          { en: "Thanks a ton! You're a legend! 🏆", zh: "太感谢了！你是传奇！" },
          { en: "Thank you for bringing this up! It means a lot.", zh: "谢谢你提出来！对我们很重要。" },
          { en: "Really appreciate your support! You're awesome! ❤️", zh: "真的很感谢你的支持！你太棒了！" },
        ],
      },
      {
        id: "ask",
        name: "❓ 追问",
        items: [
          { en: "That's interesting! Could you tell me more about it?", zh: "有意思！能再详细说说吗？" },
          { en: "Good point! But what do you think about...?", zh: "说得好！但你怎么看...？" },
          { en: "Can you elaborate on that? I'd love to understand more.", zh: "能展开说说吗？我想了解更多。" },
          { en: "Just to clarify — do you mean...?", zh: "确认一下——你的意思是...？" },
          { en: "How did you manage to do that? Any tips?", zh: "你是怎么做到的？有什么技巧吗？" },
        ],
      },
      {
        id: "encourage",
        name: "💪 鼓励",
        items: [
          { en: "Keep it up! You're doing amazing! 🔥", zh: "继续加油！你做得太棒了！" },
          { en: "Don't give up! We're all rooting for you! 💪", zh: "别放弃！我们都在支持你！" },
          { en: "You got this! Believe in yourself! 🌟", zh: "你可以的！相信自己！" },
          { en: "That's some serious progress! Well done! 👏", zh: "进步真的很大！干得好！" },
          { en: "Stay strong! The best is yet to come! 🚀", zh: "坚持住！好戏还在后头！" },
        ],
      },
      {
        id: "feedback",
        name: "📝 反馈",
        items: [
          { en: "Great suggestion! We'll pass this along to the team.", zh: "建议很棒！我们会转达给团队。" },
          { en: "Thanks for the report! We're looking into it now.", zh: "感谢反馈！我们正在跟进。" },
          { en: "Noted! This is on our radar. Stay tuned for updates! 📢", zh: "收到！已列入计划。关注后续更新！" },
          { en: "We hear you! This will be addressed in the next update.", zh: "我们听到了！下次更新会解决这个问题。" },
          { en: "Valid point! Let me discuss this with the team and get back to you.", zh: "有道理！我去跟团队讨论一下再回复你。" },
        ],
      },
      {
        id: "casual",
        name: "😄 闲聊",
        items: [
          { en: "Haha that's hilarious! 😂", zh: "哈哈太搞笑了！" },
          { en: "No way! That's crazy! 😱", zh: "不是吧！太疯狂了！" },
          { en: "Lol nice one! 🤣", zh: "哈哈不错啊！" },
          { en: "Same here! I feel you! 😅", zh: "我也是！深有同感！" },
          { en: "Let's gooo! Can't wait! 🎉", zh: "冲冲冲！等不及了！" },
          { en: "GG! That was epic! 🏅", zh: "GG！太史诗了！" },
        ],
      },
    ],

    // 调用 Gemini AI 生成上下文相关的回复建议
    generateAIReplies(originalText) {
      return new Promise((resolve, reject) => {
        if (!CONFIG.geminiApiKey) {
          reject(new Error("未配置 Gemini API Key"));
          return;
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${CONFIG.geminiApiKey}`;

        const prompt = `你是一个 Discord 游戏社区的管理员助手。用户发了以下消息：

"${originalText}"

请生成 5 条适合回复这条消息的英文话术，要求：
1. 语气友好、自然，像真人游戏玩家的说话风格
2. 每条回复都带一个合适的 emoji
3. 回复要和原消息内容相关、有针对性
4. 长度控制在 1-2 句话

请严格按以下 JSON 格式返回（不要有其他文字）：
[
  {"en": "English reply here", "zh": "对应的中文翻译"},
  {"en": "English reply here", "zh": "对应的中文翻译"}
]`;

        GM_xmlhttpRequest({
          method: "POST",
          url,
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 8192,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          onload(resp) {
            try {
              const data = JSON.parse(resp.responseText);
              if (data.error) {
                reject(new Error(data.error.message || "API 错误"));
                return;
              }
              // 兼容思考模型（2.5-flash）：跳过 thought 部分，取最后一个文本 part
              const parts = data.candidates?.[0]?.content?.parts || [];
              const textPart = parts.filter((p) => !p.thought).pop();
              const text = textPart?.text || parts[parts.length - 1]?.text || "";
              console.log("[Merida] AI 原始返回:", text.slice(0, 200));
              // 提取 JSON 数组
              const jsonMatch = text.match(/\[[\s\S]*\]/);
              if (!jsonMatch) {
                console.error("[Merida] AI 返回内容:", JSON.stringify(data, null, 2).slice(0, 2000));
                reject(new Error("AI 返回格式异常，请打开控制台(Cmd+Option+J)查看详情"));
                return;
              }
              const replies = JSON.parse(jsonMatch[0]);
              resolve(replies);
            } catch (e) {
              reject(new Error("AI 返回解析失败: " + e.message));
            }
          },
          onerror(err) {
            reject(new Error("AI 请求失败: " + (err.statusText || "网络错误")));
          },
        });
      });
    },

    // 给消息添加「建议回复」按钮
    addReplyButton(msgNode) {
      if (msgNode.querySelector(".merida-reply-link")) return;

      const contentEl = Vision._findContentEl(msgNode);
      if (!contentEl) return;

      const text = contentEl.textContent?.trim();
      if (!text || text.length < 2) return;

      const btn = Utils.el("span", { className: "merida-reply-link" }, [
        "💬 建议回复",
      ]);

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        // 切换面板显示
        const existing = msgNode.querySelector(".merida-reply-panel");
        if (existing) {
          existing.remove();
          return;
        }
        // 关闭其他已打开的面板
        document.querySelectorAll(".merida-reply-panel").forEach((p) => p.remove());
        const panel = this._createPanel(msgNode);
        contentEl.parentNode.insertBefore(panel, contentEl.nextSibling?.nextSibling || null);
      });

      // 插到翻译链接或翻译结果后面
      const after =
        msgNode.querySelector(".merida-translate-link") ||
        msgNode.querySelector(".merida-translation") ||
        contentEl;
      if (after && after.nextSibling) {
        after.parentNode.insertBefore(btn, after.nextSibling);
      } else if (after) {
        after.parentNode.appendChild(btn);
      }
    },

    // 创建回复建议面板
    _createPanel(msgNode) {
      const panel = Utils.el("div", { className: "merida-reply-panel" });

      // 获取原始消息文本（给 AI 用）
      const contentEl = Vision._findContentEl(msgNode);
      const originalText = contentEl?.textContent?.trim() || "";

      // 标签栏
      const tabs = Utils.el("div", { className: "merida-reply-tabs" });

      // AI 标签（如果配了 API Key 则显示在第一个）
      const allTabs = [];
      if (CONFIG.geminiApiKey) {
        allTabs.push({ id: "ai", name: "✨ AI 智能回复", isAI: true });
      }
      this.templates.forEach((cat) => allTabs.push(cat));

      allTabs.forEach((cat, i) => {
        const tab = Utils.el(
          "div",
          {
            className: `merida-reply-tab ${i === 0 ? "active" : ""} ${cat.isAI ? "merida-ai-tab" : ""}`,
            onClick: () => {
              tabs.querySelectorAll(".merida-reply-tab").forEach((t, j) =>
                t.classList.toggle("active", j === i)
              );
              if (cat.isAI) {
                this._renderAIReplies(panel, originalText);
              } else {
                const templateIndex = CONFIG.geminiApiKey ? i - 1 : i;
                this._renderReplyItems(panel, templateIndex);
              }
            },
          },
          [cat.name]
        );
        tabs.appendChild(tab);
      });
      panel.appendChild(tabs);

      // 内容区
      const items = Utils.el("div", { className: "merida-reply-items" });
      panel.appendChild(items);

      // 默认显示第一个标签的内容
      if (CONFIG.geminiApiKey) {
        this._renderAIReplies(panel, originalText);
      } else {
        this._renderReplyItems(panel, 0);
      }

      // 点击面板外关闭
      setTimeout(() => {
        const closeHandler = (e) => {
          if (!panel.contains(e.target) && !e.target.classList.contains("merida-reply-link")) {
            panel.remove();
            document.removeEventListener("click", closeHandler);
          }
        };
        document.addEventListener("click", closeHandler);
      }, 100);

      return panel;
    },

    // 创建单条回复项（带复制按钮）
    _createReplyRow(item, panel) {
      const row = Utils.el("div", { className: "merida-reply-item" }, [
        Utils.el("div", { className: "merida-reply-item-row" }, [
          Utils.el("div", { className: "merida-reply-item-text" }, [
            Utils.el("div", { className: "merida-reply-item-en" }, [item.en]),
            Utils.el("div", { className: "merida-reply-item-zh" }, [item.zh]),
          ]),
          (() => {
            const copyBtn = Utils.el("button", { className: "merida-copy-btn" }, ["复制"]);
            copyBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              GM_setClipboard(item.en);
              copyBtn.textContent = "已复制 ✓";
              copyBtn.classList.add("copied");
              setTimeout(() => {
                copyBtn.textContent = "复制";
                copyBtn.classList.remove("copied");
              }, 2000);
              showToast("已复制英文回复 — 点 Discord 回复按钮后 Cmd+V 粘贴");
            });
            return copyBtn;
          })(),
        ]),
      ]);

      // 点击整行也能复制
      row.addEventListener("click", () => {
        GM_setClipboard(item.en);
        panel.remove();
        showToast(`已复制: "${item.en.slice(0, 50)}…"`);
      });

      return row;
    },

    _renderReplyItems(panel, catIndex) {
      const container = panel.querySelector(".merida-reply-items");
      container.innerHTML = "";

      const cat = this.templates[catIndex];
      if (!cat) return;

      cat.items.forEach((item) => {
        container.appendChild(this._createReplyRow(item, panel));
      });
    },

    // 渲染 AI 生成的回复
    async _renderAIReplies(panel, originalText) {
      const container = panel.querySelector(".merida-reply-items");
      container.innerHTML = "";

      if (!originalText) {
        container.appendChild(
          Utils.el("div", { className: "merida-ai-loading" }, ["无法获取消息内容"])
        );
        return;
      }

      // 加载状态
      container.appendChild(
        Utils.el("div", { className: "merida-ai-loading" }, ["✨ AI 正在根据消息内容生成回复建议..."])
      );

      try {
        const replies = await this.generateAIReplies(originalText);
        container.innerHTML = "";

        if (!replies || replies.length === 0) {
          container.appendChild(
            Utils.el("div", { className: "merida-ai-loading" }, ["AI 未生成有效回复，请重试"])
          );
          return;
        }

        replies.forEach((item) => {
          if (item.en && item.zh) {
            container.appendChild(this._createReplyRow(item, panel));
          }
        });
      } catch (err) {
        container.innerHTML = "";
        container.appendChild(
          Utils.el("div", { className: "merida-ai-loading" }, [
            `AI 生成失败: ${err.message}`,
          ])
        );
        console.error("[Merida] AI 回复生成失败:", err);
      }
    },

    // 给所有消息加回复按钮
    addToAll() {
      const msgs = document.querySelectorAll('[class*="messageListItem_"]');
      msgs.forEach((m) => this.addReplyButton(m));
    },
  };

  // ============================================================
  //  第5层：模块2「说」中文转游戏黑话 (The Voice)
  // ============================================================
  const Voice = {
    _panel: null,
    _visible: false,
    _activeCategory: 0,

    // 将文本写入 Discord 输入框
    writeToInput(text) {
      // 方案1（推荐）：模拟原生 setter + input 事件
      const textArea =
        document.querySelector('[class*="textArea_"]') ||
        document.querySelector('[role="textbox"]');
      if (!textArea) {
        // 后备方案：复制到剪贴板
        GM_setClipboard(text);
        showToast("已复制到剪贴板，按 Ctrl+V 粘贴！");
        return;
      }

      // 尝试使用 React 兼容方式写入
      try {
        // 对于 contenteditable div（Discord 使用的方式）
        if (textArea.getAttribute("contenteditable") === "true") {
          textArea.focus();
          // 选中所有已有内容
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(textArea);
          selection.removeAllRanges();
          selection.addRange(range);
          // 使用 insertText 命令插入（会触发 React 的事件监听）
          document.execCommand("insertText", false, text);
          showToast("已输入到聊天框！");
          return;
        }
        // 对于普通 textarea（后备）
        const proto = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        );
        if (proto && proto.set) {
          proto.set.call(textArea, text);
          textArea.dispatchEvent(new Event("input", { bubbles: true }));
          showToast("已输入到聊天框！");
          return;
        }
      } catch (e) {
        console.warn("[Merida] 输入框写入失败，改用剪贴板:", e);
      }

      // 最终后备：剪贴板
      GM_setClipboard(text);
      showToast("已复制到剪贴板，按 Ctrl+V 粘贴！");
    },

    // 创建黑话面板
    createPanel() {
      if (this._panel) return this._panel;

      const panel = Utils.el("div", { className: "merida-slang-panel" });

      // 标签栏
      const tabs = Utils.el("div", { className: "merida-slang-tabs" });
      CONFIG.slangDict.categories.forEach((cat, i) => {
        const tab = Utils.el(
          "div",
          {
            className: `merida-slang-tab ${i === 0 ? "active" : ""}`,
            onClick: () => this._switchTab(i),
          },
          [`${cat.icon} ${cat.name}`]
        );
        tab.dataset.index = i;
        tabs.appendChild(tab);
      });
      panel.appendChild(tabs);

      // 内容区
      const itemsContainer = Utils.el("div", {
        className: "merida-slang-items",
        id: "merida-slang-items",
      });
      panel.appendChild(itemsContainer);

      this._panel = panel;
      this._renderItems(0);
      return panel;
    },

    _switchTab(index) {
      this._activeCategory = index;
      const tabs = this._panel.querySelectorAll(".merida-slang-tab");
      tabs.forEach((t, i) => {
        t.classList.toggle("active", i === index);
      });
      this._renderItems(index);
    },

    _renderItems(catIndex) {
      const container = this._panel.querySelector("#merida-slang-items");
      if (!container) return;
      container.innerHTML = "";

      const cat = CONFIG.slangDict.categories[catIndex];
      if (!cat) return;

      if (cat.items.length === 0) {
        container.appendChild(
          Utils.el(
            "div",
            { style: { color: "#666", padding: "20px", textAlign: "center", fontSize: "13px" } },
            ["暂无条目，在设置面板中添加自定义黑话 ✏️"]
          )
        );
        return;
      }

      cat.items.forEach((item) => {
        const row = Utils.el("div", { className: "merida-slang-item" }, [
          Utils.el("span", { className: "merida-slang-zh" }, [item.zh]),
          Utils.el("span", { className: "merida-slang-en" }, [item.en]),
        ]);
        row.addEventListener("click", () => {
          this.writeToInput(item.en);
          this.hide();
        });
        container.appendChild(row);
      });
    },

    // 显示/隐藏切换
    toggle() {
      if (this._visible) {
        this.hide();
      } else {
        this.show();
      }
    },

    show() {
      // 找到输入框的外层容器
      const formWrapper =
        document.querySelector('[class*="channelTextArea_"]') ||
        document.querySelector('[class*="textArea_"]')?.closest("form") ||
        document.querySelector('[class*="textArea_"]')?.parentElement;
      if (!formWrapper) return;

      // 确保容器是相对定位
      const computed = window.getComputedStyle(formWrapper);
      if (computed.position === "static") {
        formWrapper.style.position = "relative";
      }

      const panel = this.createPanel();
      if (!formWrapper.contains(panel)) {
        formWrapper.appendChild(panel);
      }
      panel.style.display = "flex";
      this._visible = true;

      // 更新切换按钮状态
      document.querySelectorAll(".merida-slang-toggle").forEach((b) => {
        b.classList.add("active");
      });
    },

    hide() {
      if (this._panel) {
        this._panel.style.display = "none";
      }
      this._visible = false;
      document.querySelectorAll(".merida-slang-toggle").forEach((b) => {
        b.classList.remove("active");
      });
    },

    // 创建切换按钮（注入到输入框旁边）
    createToggleButton() {
      const btn = Utils.el("button", {
        className: "merida-slang-toggle",
        title: "游戏黑话快捷输入",
        type: "button",
      }, ["📖"]);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      });
      return btn;
    },

    // 注入切换按钮
    injectToggle(buttonsContainer) {
      if (buttonsContainer.querySelector(".merida-slang-toggle")) return;
      const btn = this.createToggleButton();
      if (buttonsContainer.firstChild) {
        buttonsContainer.insertBefore(btn, buttonsContainer.firstChild);
      } else {
        buttonsContainer.appendChild(btn);
      }
    },
  };

  // ============================================================
  //  第6层：设置面板 (Settings Panel)
  // ============================================================
  function openSettings() {
    if (document.querySelector(".merida-settings-overlay")) return;

    const overlay = Utils.el("div", { className: "merida-settings-overlay" });
    const panel = Utils.el("div", { className: "merida-settings-panel" });

    panel.innerHTML = `
      <h2>⚙️ Merida Discord 管理脚本 - 设置</h2>

      <h3>模块1「看」翻译模式</h3>
      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer;
                      padding:8px 14px; border-radius:6px;
                      background:${CONFIG.translateMode === "auto" ? "#7289da" : "#2f3136"};
                      color:${CONFIG.translateMode === "auto" ? "#fff" : "#999"};
                      border:1px solid ${CONFIG.translateMode === "auto" ? "#7289da" : "#40444b"};">
          <input type="radio" name="merida-translate-mode" value="auto"
                 ${CONFIG.translateMode === "auto" ? "checked" : ""}
                 style="accent-color:#7289da;" />
          自动翻译
        </label>
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer;
                      padding:8px 14px; border-radius:6px;
                      background:${CONFIG.translateMode === "manual" ? "#7289da" : "#2f3136"};
                      color:${CONFIG.translateMode === "manual" ? "#fff" : "#999"};
                      border:1px solid ${CONFIG.translateMode === "manual" ? "#7289da" : "#40444b"};">
          <input type="radio" name="merida-translate-mode" value="manual"
                 ${CONFIG.translateMode === "manual" ? "checked" : ""}
                 style="accent-color:#7289da;" />
          点击翻译
        </label>
      </div>
      <label style="color:#72d4a3; font-size:12px;">
        自动模式：所有非中文消息直接显示中文翻译（活跃频道可能消耗较多请求）<br/>
        点击模式：鼠标悬浮消息后点翻译按钮才翻译（省流量，按需翻译）
      </label>

      <h3>💬 AI 智能回复 (Gemini)</h3>
      <label>Gemini API Key（留空则只用预设话术）</label>
      <input type="text" id="merida-cfg-gemini-key"
             value="${CONFIG.geminiApiKey}"
             placeholder="AIzaSy..." />
      <label style="color:#72d4a3; font-size:12px;">
        获取方式：访问 <a href="https://aistudio.google.com/apikey" target="_blank"
        style="color:#7289da;">aistudio.google.com/apikey</a> → 创建 API Key → 粘贴到这里<br/>
        填入后，「建议回复」面板会多出 ✨AI智能回复 标签，根据对方消息内容自动生成回复
      </label>

      <h3>模块2「说」自定义黑话</h3>
      <label>每行一条，格式：中文 = 英文</label>
      <textarea id="merida-cfg-slang" rows="6" placeholder="来PK = Anyone down for a PK?&#10;组队 = LFG!">${
        CONFIG.slangDict.categories
          .find((c) => c.id === "custom")
          ?.items.map((i) => `${i.zh} = ${i.en}`)
          .join("\n") || ""
      }</textarea>

      <h3>模块3「管」关键词预警</h3>
      <label>关键词列表（英文逗号分隔）</label>
      <input type="text" id="merida-cfg-keywords"
             value="${CONFIG.alertKeywords.join(", ")}" />
      <label style="margin-top: 8px;">
        <input type="checkbox" id="merida-cfg-alert-on"
               ${CONFIG.alertEnabled ? "checked" : ""} />
        启用关键词高亮
      </label><br/>
      <label style="margin-top: 4px;">
        <input type="checkbox" id="merida-cfg-notify-on"
               ${CONFIG.alertDesktopNotify ? "checked" : ""} />
        弹出桌面通知
      </label>

      <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
        <button class="merida-settings-btn ghost" id="merida-cfg-cancel">取消</button>
        <button class="merida-settings-btn primary" id="merida-cfg-save">保存</button>
      </div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // 点击遮罩关闭
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // 取消
    panel.querySelector("#merida-cfg-cancel").addEventListener("click", () => {
      overlay.remove();
    });

    // 保存
    panel.querySelector("#merida-cfg-save").addEventListener("click", async () => {
      // 翻译模式
      const modeRadio = panel.querySelector('input[name="merida-translate-mode"]:checked');
      if (modeRadio) await CONFIG.save("translateMode", modeRadio.value);

      // Gemini API Key
      const geminiKey = panel.querySelector("#merida-cfg-gemini-key").value.trim();
      await CONFIG.save("geminiApiKey", geminiKey);

      // 自定义黑话
      const slangText = panel.querySelector("#merida-cfg-slang").value.trim();
      const customItems = slangText
        .split("\n")
        .map((line) => {
          const parts = line.split("=").map((s) => s.trim());
          if (parts.length >= 2 && parts[0] && parts[1]) {
            return { zh: parts[0], en: parts.slice(1).join("=").trim() };
          }
          return null;
        })
        .filter(Boolean);
      const customCat = CONFIG.slangDict.categories.find((c) => c.id === "custom");
      if (customCat) customCat.items = customItems;
      await CONFIG.save("slangDict", CONFIG.slangDict);

      // 关键词
      const kwText = panel.querySelector("#merida-cfg-keywords").value.trim();
      const keywords = kwText
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      await CONFIG.save("alertKeywords", keywords);
      await CONFIG.save(
        "alertEnabled",
        panel.querySelector("#merida-cfg-alert-on").checked
      );
      await CONFIG.save(
        "alertDesktopNotify",
        panel.querySelector("#merida-cfg-notify-on").checked
      );

      overlay.remove();
      showToast("设置已保存！刷新页面生效。");
    });
  }

  // ============================================================
  //  第7层：Toast 提示
  // ============================================================
  function showToast(message, duration = 3000) {
    const existing = document.querySelector(".merida-toast");
    if (existing) existing.remove();

    const toast = Utils.el("div", { className: "merida-toast" }, [message]);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  // ============================================================
  //  第8层：核心 MutationObserver（总调度）
  // ============================================================
  function startObserver() {
    const observer = new MutationObserver((mutations) => {
      const newItems = new Set();
      const updatedItems = new Set();

      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          Utils.messageItemsFrom(mutation.target).forEach((m) =>
            updatedItems.add(m)
          );
          continue;
        }

        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            // ---- 模块2：在输入框工具栏注入黑话按钮 ----
            if (
              node.matches?.('[class*="buttons_"][class*="74017"]') ||
              node.querySelector?.('[class*="buttons_"]')
            ) {
              const btnContainers = node.matches?.('[class*="buttons_"]')
                ? [node]
                : [...node.querySelectorAll('[class*="buttons_"]')];
              btnContainers.forEach((bc) => {
                const isInputArea = bc.closest('[class*="channelTextArea_"]');
                if (isInputArea) Voice.injectToggle(bc);
              });
            }

            // ---- 频道头部：注入设置按钮 ----
            if (
              node.matches?.('[class*="toolbar_"]') ||
              node.querySelector?.('[class*="toolbar_"]')
            ) {
              const toolbars = node.matches?.('[class*="toolbar_"]')
                ? [node]
                : [...node.querySelectorAll('[class*="toolbar_"]')];
              toolbars.forEach((tb) => {
                if (tb.querySelector(".merida-header-btn")) return;
                const settingsBtn = Utils.el(
                  "button",
                  {
                    className: "merida-header-btn",
                    title: "Merida 脚本设置",
                    onClick: openSettings,
                  },
                  ["⚙"]
                );
                tb.appendChild(settingsBtn);
              });
            }

            // 新消息：added node 本身是 li，或是包裹多条 li 的容器
            if (node.matches('[class*="messageListItem_"]')) {
              newItems.add(node);
              continue;
            }
            if (
              !node.closest('[class*="messageListItem_"]') &&
              node.querySelector('[class*="messageListItem_"]')
            ) {
              node
                .querySelectorAll('[class*="messageListItem_"]')
                .forEach((m) => newItems.add(m));
              continue;
            }
          }

          // 已有消息内部 DOM 变化（编辑保存、「已编辑」标记、内容重绘）
          Utils.messageItemsFrom(node).forEach((m) => updatedItems.add(m));
        }
      }

      newItems.forEach((m) => {
        Guard.scanMessage(m);
        if (CONFIG.translateMode === "auto") Vision.autoTranslate(m);
        Vision.scheduleRefresh(m);
      });
      updatedItems.forEach((m) => {
        if (newItems.has(m)) return;
        Vision.scheduleRefresh(m);
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // ============================================================
  //  第9层：首次扫描 + 注入已有元素
  // ============================================================
  function initialScan() {
    // 扫描已加载的消息（关键词预警）
    Guard.scanAll();

    // 自动翻译已加载的消息
    Vision.scanAll();

    // 延迟 3 秒后，给漏翻的消息加「点击翻译」链接
    setTimeout(() => {
      Vision.addLinksToAll();
      SmartReply.addToAll();
    }, 3000);

    // 注入输入框的黑话按钮
    const inputButtons = document.querySelectorAll('[class*="channelTextArea_"] [class*="buttons_"]');
    inputButtons.forEach((bc) => Voice.injectToggle(bc));

    // 注入频道头部设置按钮
    const toolbars = document.querySelectorAll('[class*="toolbar_"]');
    toolbars.forEach((tb) => {
      if (tb.querySelector(".merida-header-btn")) return;
      if (!tb.closest('section[aria-label]')) return; // 确保是频道头部
      const settingsBtn = Utils.el(
        "button",
        {
          className: "merida-header-btn",
          title: "Merida 脚本设置",
          onClick: openSettings,
        },
        ["⚙"]
      );
      tb.appendChild(settingsBtn);
    });
  }

  // ============================================================
  //  第10层：启动入口
  // ============================================================
  function isDiscordReady() {
    // 多种选择器兜底，适配不同版本的 Discord
    return !!(
      document.querySelector('[class*="chatContent_"]') ||
      document.querySelector('[class*="chat_"]') ||
      document.querySelector('[data-list-id="chat-messages"]') ||
      document.querySelector('[class*="messagesWrapper_"]') ||
      document.querySelector('main[class*="chatContent"]') ||
      document.querySelector('div[class*="content_"] > div[class*="chat_"]') ||
      document.querySelector('ol[class*="scrollerInner_"]') ||
      document.querySelector('[role="textbox"]')
    );
  }

  async function main() {
    console.log("%c[Merida] 脚本启动中...", "color:#7289da;font-weight:bold;");
    console.log("[Merida] 当前 URL:", window.location.href);

    // 加载配置
    await CONFIG.load();
    console.log("[Merida] 配置已加载, 翻译模式:", CONFIG.translateMode);

    // 注册油猴菜单命令
    GM_registerMenuCommand("⚙️ Merida 脚本设置", openSettings);

    // 请求通知权限
    if (CONFIG.alertDesktopNotify && window.Notification) {
      Notification.requestPermission();
    }

    // 等待 Discord 页面加载完成
    let attempts = 0;
    const waitForDiscord = setInterval(() => {
      attempts++;
      if (isDiscordReady()) {
        clearInterval(waitForDiscord);
        console.log("%c[Merida] Discord 页面就绪！正在注入模块...", "color:#43b581;font-weight:bold;");
        initialScan();
        startObserver();
        showToast("Merida 管理脚本已加载 ✓");
      } else if (attempts % 10 === 0) {
        console.log(`[Merida] 等待 Discord 加载... (${attempts * 500}ms)`);
      }
    }, 500);

    // 超时保护（30秒后强制启动）
    setTimeout(() => {
      if (document.querySelector(".merida-header-btn")) return; // 已启动
      clearInterval(waitForDiscord);
      console.warn("[Merida] 等待超时，强制启动 Observer...");
      console.log("[Merida] 页面内容:", document.body?.className?.slice(0, 100));
      startObserver();
      showToast("Merida 脚本已加载（延迟模式）");
    }, 30000);
  }

  // 确保 DOM 就绪后再执行
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
