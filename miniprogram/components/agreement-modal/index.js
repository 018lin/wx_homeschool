/**
 * 协议弹窗组件（agreement-modal）
 * ---------------------------------------------------------------------------
 * 职责：
 *   1. 根据 doc-type 渲染《用户协议》/《隐私政策》全文（正文来自 utils/agreement-content.js）；
 *   2. 提供长文滚动 + 标题层级（文档标题 / 章节标题 / 小节标题 / 正文 / 列表 / 提示块 / 表格）；
 *   3. 底部固定操作栏：「同意并继续」+「关闭」。
 *
 * 设计取舍（2026-10-14 调整）：
 *   **不做强制阅读**。不统计阅读进度、不置灰按钮、不拦截登录。
 *   「同意并继续」随时可点，点击即视为同意并关闭；「关闭」则关闭弹窗不改同意态，
 *   由用户回到页面自行勾选。合规上靠「明示告知 + 主动勾选 + 可随时查阅」，
 *   而非强制阅读门槛。
 *
 * 用法：
 *   <agreement-modal visible="{{agreementVisible}}" doc-type="{{agreementDoc}}"
 *                   bind:close="onCloseAgreement" bind:confirm="onAgreementConfirm" />
 *
 * 事件：
 *   close   用户点击「关闭」或遮罩（关闭不视为同意）
 *   confirm 用户点击「同意并继续」，detail = { doc, title, version, agreedAt }
 *
 * 组件完全自包含：不写业务判断、不直接操作登录态，只负责展示与抛事件。
 */

var agreement = require("../../utils/agreement-content.js");

Component({
  properties: {
    // 是否显示
    visible: { type: Boolean, value: false },
    // 文档类型：user-agreement | privacy-policy
    docType: { type: String, value: "user-agreement" }
  },

  data: {
    title: "",
    subtitle: "",
    version: "",
    effectiveDate: "",
    updatedDate: "",
    intro: "",
    sections: [],
    footer: "",
    scrollTop: 0,
    statusBarHeight: 20
  },

  observers: {
    /** 弹窗打开或切换文档时载入正文，并把滚动位置归零 */
    "visible, docType": function (visible, docType) {
      if (!visible) return;
      var doc = agreement.getDoc(docType);
      this.setData({
        title: doc.title,
        subtitle: doc.subtitle,
        version: doc.meta.version,
        effectiveDate: doc.meta.effectiveDate,
        updatedDate: doc.meta.updatedDate,
        intro: doc.intro,
        sections: doc.sections,
        footer: doc.footer,
        scrollTop: 0
      });
    }
  },

  lifetimes: {
    attached: function () {
      this.measureStatusBar();
    }
  },

  pageLifetimes: {
    show: function () {
      this.measureStatusBar();
    }
  },

  methods: {
    /** 状态栏高度：用于遮罩层与顶部的安全留白 */
    measureStatusBar: function () {
      var statusBarHeight = 20;
      try {
        var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        statusBarHeight = (info && info.statusBarHeight) || 20;
      } catch (e) {}
      this.setData({ statusBarHeight: statusBarHeight });
    },

    /** 点击遮罩：等同「关闭」，不视为同意 */
    onTapMask: function () {
      this.triggerEvent("close", { reason: "mask" });
    },

    /** 阻止弹窗内部交互冒泡到遮罩 */
    onTapBody: function () {},

    onClose: function () {
      this.triggerEvent("close", { reason: "button" });
    },

    /** 「同意并继续」：随时可点，点了即同意并由页面关闭弹窗 */
    onConfirm: function () {
      var doc = agreement.getDoc(this.properties.docType);
      this.triggerEvent("confirm", {
        doc: doc.key,
        title: doc.title,
        version: doc.meta.version,
        agreedAt: Date.now()
      });
    }
  }
});