import {
    Plugin,
    showMessage,
    Dialog,
    Setting,
    fetchPost,
    Protyle,
    IOperation,
    getAllEditor,
    IProtyle,
    getFrontend,
    getBackend,
    ICardData,
    ICard,
    openTab,
    openWindow,
    openMobileFileById,
    lockScreen,
    exitSiYuan,
    Menu,
    openSetting,
    getModelByDockType,
    Files,
    Constants,
    App
} from "siyuan";
import "./index.scss";
import { MD5 } from "crypto-js";

const STORAGE_NAME = "ai-inserter-config";
const CACHE_PREFIX = "ai-inserter-cache-";
const TAB_TYPE = "custom_tab";

export default class AIInserterPlugin extends Plugin {
    private apiKey: string;
    private isMobile: boolean;

    async onload() {
        try {
            console.log("AI Inserter plugin loading...");
            this.apiKey = await this.loadData(STORAGE_NAME) || "";
            this.isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile";

            await this.addSettingItem();
            await this.addTopBarIcon();
            await this.addPluginCommand();

            this.eventBus.on("click-blockicon", this.blockIconEvent.bind(this));

            console.log(this.i18n.helloPlugin);
            console.log("AI Inserter plugin loaded successfully.");
        } catch (error) {
            console.error("Error loading AI Inserter plugin:", error);
            showMessage(`Failed to load AI Inserter plugin: ${error.message}`);
        }
    }

    private async addSettingItem() {
        try {
            console.log("Adding AI Inserter setting item...");
            const apiKeyInput = document.createElement("input");
            apiKeyInput.type = "password";
            apiKeyInput.className = "b3-text-field fn__flex-center fn__size200";
            apiKeyInput.value = this.apiKey;

            this.setting = new Setting({
                confirmCallback: () => {
                    this.apiKey = apiKeyInput.value;
                    this.saveData(STORAGE_NAME, this.apiKey);
                    showMessage("API Key saved");
                    console.log("AI Inserter API Key saved.");
                }
            });

            this.setting.addItem({
                title: "AI Service API Key",
                description: "Enter your AI service API key (e.g., OpenAI API key)",
                createActionElement: () => apiKeyInput,
            });

            console.log("AI Inserter setting item added successfully.");
        } catch (error) {
            console.error("Error adding setting item:", error);
            throw error;
        }
    }

    private async addTopBarIcon() {
        try {
            this.addTopBar({
                icon: "../iconai.jpg",
                title: this.i18n.addTopBarIcon,
                position: "right",
                callback: () => this.openAIDialog()
            });
        } catch (error) {
            console.error("Error adding top bar icon:", error);
            throw error;
        }
    }

    private async addPluginCommand() {
        try {
            this.addCommand({
                langKey: "openAIDialog",
                hotkey: "⌥B",
                callback: () => this.openAIDialog()
            });
        } catch (error) {
            console.error("Error adding plugin command:", error);
            throw error;
        }
    }

    private async validateAPIKey(apiKey: string): Promise<boolean> {
        try {
            const response = await fetch("https://api.vveai.com/v1/models", {
                headers: {
                    "Authorization": `Bearer ${apiKey}`
                }
            });
            return response.ok;
        } catch (error) {
            console.error("Error validating API key:", error);
            return false;
        }
    }

    private generateCacheKey(prompt: string): string {
        const hash = MD5(prompt).toString();
        return `${CACHE_PREFIX}${hash}`;
    }

    private getCachedResponse(prompt: string): string | null {
        const key = this.generateCacheKey(prompt);
        return localStorage.getItem(key);
    }

    private setCachedResponse(prompt: string, response: string): void {
        const key = this.generateCacheKey(prompt);
        try {
            localStorage.setItem(key, response);
        } catch (e) {
            console.error("Failed to set cache:", e);
            // 如果存储失败，清理一些旧的缓存
            this.clearOldCache();
        }
    }

    private clearOldCache(): void {
        const keys = Object.keys(localStorage);
        const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
        cacheKeys.sort((a, b) => {
            const timeA = localStorage.getItem(a)?.split("|")[0] || "0";
            const timeB = localStorage.getItem(b)?.split("|")[0] || "0";
            return parseInt(timeA) - parseInt(timeB);
        });
        
        // 删除最旧的 20% 的缓存
        const deleteCount = Math.ceil(cacheKeys.length * 0.2);
        cacheKeys.slice(0, deleteCount).forEach(key => localStorage.removeItem(key));
    }

    private openAIDialog() {
        const dialog = new Dialog({
            title: "AI Inserter",
            content: `<div class="b3-dialog__content">
                <textarea class="b3-text-field fn__block" id="aiInput" rows="5" placeholder="Enter your prompt here"></textarea>
            </div>
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--cancel">${this.i18n.cancel}</button><div class="fn__space"></div>
                <button class="b3-button b3-button--text">${this.i18n.confirm}</button>
            </div>`,
            width: this.isMobile ? "92vw" : "520px",
        });

        const inputElement = dialog.element.querySelector("#aiInput") as HTMLTextAreaElement;
        const btnsElement = dialog.element.querySelectorAll(".b3-button");

        dialog.bindInput(inputElement, () => {
            (btnsElement[1] as HTMLButtonElement).click();
        });

        inputElement.focus();

        btnsElement[0].addEventListener("click", () => {
            dialog.destroy();
        });

        btnsElement[1].addEventListener("click", () => {
            this.generateAIResponse(inputElement.value);
            dialog.destroy();
        });
    }

    private async generateAIResponse(prompt: string) {
        if (!this.apiKey) {
            showMessage("请在插件设置中设置您的 API 密钥");
            return;
        }

        const cachedResponse = this.getCachedResponse(prompt);
        if (cachedResponse) {
            this.insertTextToEditor(cachedResponse);
            return;
        }

        try {
            const generatedText = await this.fetchAIResponse(prompt);
            this.setCachedResponse(prompt, generatedText);
            this.insertTextToEditor(generatedText);
        } catch (error) {
            this.handleAIResponseError(error);
        }
    }

    private async fetchAIResponse(prompt: string): Promise<string> {
        const response = await fetch("https://api.vveai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`,
                "Accept": "application/json"
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "user", content: prompt }]
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content.trim();
    }

    private handleAIResponseError(error: unknown) {
        console.error("生成 AI 响应时出错:", error);
        if (error instanceof Error) {
            if (error.message.includes("401")) {
                showMessage("无效的 API 密钥。请检查插件设置中的 API 密钥。");
            } else if (error.message.includes("429")) {
                showMessage("超出速率限制。请稍后再试。");
            } else {
                showMessage("生成AI响应时出错，请稍后重试");
            }
        } else {
            showMessage("发生未知错误。请重试。");
        }
    }

    private insertTextToEditor(text: string) {
        const protyle = this.getProtyle();
        if (protyle) {
            // 使用类型断言来调用 insert 方法
            (protyle as any).insert(text);
        } else {
            showMessage("No active editor found");
        }
    }

    private getProtyle(): IProtyle | null {
        const editors = getAllEditor();
        if (editors.length === 0) {
            return null;
        }
        return editors[0].protyle;
    }

    private getEditor() {
        return getAllEditor()[0];
    }

    private eventBusLog({detail}: any) {
        console.log(detail);
    }

    private eventBusPaste(event: any) {
        event.preventDefault();
        event.detail.resolve({
            textPlain: event.detail.textPlain.trim(),
        });
    }

    onunload() {
        console.log(this.i18n.byePlugin);
        // 清理事件监听器
        this.eventBus.off("click-blockicon", this.blockIconEvent);
        // 清理缓存
        this.clearAllCache();
        // 移除顶栏图标
        const topBarElement = document.querySelector("[data-type='iconAI']");
        if (topBarElement) {
            topBarElement.remove();
        }
    }

    private clearAllCache(): void {
        const keys = Object.keys(localStorage);
        const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
        cacheKeys.forEach(key => localStorage.removeItem(key));
    }

    private blockIconEvent({detail}: any) {
        detail.menu.addItem({
            id: "pluginSample_removeSpace",
            iconHTML: "../iconai.jpg",
            label: this.i18n.removeSpace,
            click: () => {
                const doOperations: IOperation[] = [];
                detail.blockElements.forEach((item: HTMLElement) => {
                    const editElement = item.querySelector('[contenteditable="true"]');
                    if (editElement) {
                        editElement.textContent = editElement.textContent.replace(/ /g, "");
                        doOperations.push({
                            id: item.dataset.nodeId,
                            data: item.outerHTML,
                            action: "update"
                        });
                    }
                });
                detail.protyle.getInstance().transaction(doOperations);
            }
        });
    }

    public addFloatLayer(options: { refDefs: { refID: string }[], x: number, y: number, isBacklink: boolean }) {
        const floatLayer = document.createElement("div");
        floatLayer.className = "protyle-wysiwyg__float";
        floatLayer.style.left = `${options.x}px`;
        floatLayer.style.top = `${options.y}px`;
        floatLayer.setAttribute("data-type", "block-ref");
        
        options.refDefs.forEach(ref => {
            const refElement = document.createElement("div");
            refElement.setAttribute("data-type", "block-ref");
            refElement.setAttribute("data-id", ref.refID);
            floatLayer.appendChild(refElement);
        });

        document.body.appendChild(floatLayer);

        // 如果是反向链接，可以添加额外的处理
        if (options.isBacklink) {
            floatLayer.classList.add("protyle-wysiwyg__float--backlink");
        }

        console.log("Float layer added:", floatLayer);
    }

    private showDialog() {
        const dialog = new Dialog({
            title: `SiYuan ${Constants.SIYUAN_VERSION}`,
            content: `<div class="b3-dialog__content">
    <div>appId:</div>
    <div class="fn__hr"></div>
    <div class="plugin-sample__time">${this.app.appId}</div>
    <div class="fn__hr"></div>
    <div class="fn__hr"></div>
    <div>API demo:</div>
    <div class="fn__hr"></div>
    <div class="plugin-sample__time">System current time: <span id="time"></span></div>
    <div class="fn__hr"></div>
    <div class="fn__hr"></div>
    <div>Protyle demo:</div>
    <div class="fn__hr"></div>
    <div id="protyle" style="height: 360px;"></div>
</div>`,
            width: this.isMobile ? "92vw" : "560px",
            height: "540px",
        });
        new Protyle(this.app, dialog.element.querySelector("#protyle") as HTMLElement, {
            blockId: this.getProtyle()?.block.rootID,
        });
        fetchPost("/api/system/currentTime", {}, (response) => {
            dialog.element.querySelector("#time").innerHTML = new Date(response.data).toString();
        });
    }

    private addMenu(rect?: DOMRect) {
        const menu = new Menu("topBarSample", () => {
            console.log(this.i18n.byeMenu);
        });
        menu.addItem({
            icon: "iconSettings",
            label: "Open Setting",
            click: () => {
                openSetting(this.app);
            }
        });
        // 删除 Open Attribute Panel 菜单项
        menu.addItem({
            icon: "iconInfo",
            label: "Dialog(open doc first)",
            accelerator: this.commands[0].customHotkey,
            click: () => {
                this.showDialog();
            }
        });
        menu.addItem({
            icon: "iconFocus",
            label: "Select Opened Doc(open doc first)",
            click: () => {
                (getModelByDockType("file") as Files).selectItem(this.getEditor().protyle.notebookId, this.getEditor().protyle.path);
            }
        });
        if (!this.isMobile) {
            menu.addItem({
                icon: "iconFace",
                label: "Open Custom Tab",
                click: () => {
                    const tab = openTab({
                        app: this.app,
                        custom: {
                            icon: "iconFace",
                            title: "Custom Tab",
                            data: {
                                text: "This is my custom tab",
                            },
                            id: this.name + TAB_TYPE
                        },
                    });
                    console.log(tab);
                }
            });
            menu.addItem({
                icon: "iconImage",
                label: "Open Asset Tab(First open the Chinese help document)",
                click: () => {
                    const tab = openTab({
                        app: this.app,
                        asset: {
                            path: "assets/paragraph-20210512165953-ag1nib4.svg"
                        }
                    });
                    console.log(tab);
                }
            });
            menu.addItem({
                icon: "iconFile",
                label: "Open Doc Tab(open doc first)",
                click: async () => {
                    const tab = await openTab({
                        app: this.app,
                        doc: {
                            id: this.getEditor().protyle.block.rootID,
                        }
                    });
                    console.log(tab);
                }
            });
            menu.addItem({
                icon: "iconSearch",
                label: "Open Search Tab",
                click: () => {
                    const tab = openTab({
                        app: this.app,
                        search: {
                            k: "SiYuan"
                        }
                    });
                    console.log(tab);
                }
            });
            menu.addItem({
                icon: "iconRiffCard",
                label: "Open Card Tab",
                click: () => {
                    const tab = openTab({
                        app: this.app,
                        card: {
                            type: "all"
                        }
                    });
                    console.log(tab);
                }
            });
            menu.addItem({
                icon: "iconLayout",
                label: "Open Float Layer(open doc first)",
                click: () => {
                    this.addFloatLayer({
                        refDefs: [{refID: this.getEditor().protyle.block.rootID}],
                        x: window.innerWidth - 768 - 120,
                        y: 32,
                        isBacklink: false
                    });
                }
            });
            menu.addItem({
                icon: "iconOpenWindow",
                label: "Open Doc Window(open doc first)",
                click: () => {
                    openWindow({
                        doc: {id: this.getEditor().protyle.block.rootID}
                    });
                }
            });
        } else {
            menu.addItem({
                icon: "iconFile",
                label: "Open Doc(open doc first)",
                click: () => {
                    openMobileFileById(this.app, this.getEditor().protyle.block.rootID);
                }
            });
        }
        menu.addItem({
            icon: "iconLock",
            label: "Lockscreen",
            click: () => {
                lockScreen(this.app);
            }
        });
        menu.addItem({
            icon: "iconQuit",
            label: "Exit Application",
            click: () => {
                exitSiYuan();
            }
        });
        menu.addItem({
            icon: "iconScrollHoriz",
            label: "Event Bus",
            type: "submenu",
            submenu: [{
                icon: "iconSelect",
                label: "On ws-main",
                click: () => {
                    this.eventBus.on("ws-main", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off ws-main",
                click: () => {
                    this.eventBus.off("ws-main", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On click-pdf",
                click: () => {
                    this.eventBus.on("click-pdf", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off click-pdf",
                click: () => {
                    this.eventBus.off("click-pdf", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On click-editorcontent",
                click: () => {
                    this.eventBus.on("click-editorcontent", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off click-editorcontent",
                click: () => {
                    this.eventBus.off("click-editorcontent", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On click-editortitleicon",
                click: () => {
                    this.eventBus.on("click-editortitleicon", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off click-editortitleicon",
                click: () => {
                    this.eventBus.off("click-editortitleicon", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On click-flashcard-action",
                click: () => {
                    this.eventBus.on("click-flashcard-action", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off click-flashcard-action",
                click: () => {
                    this.eventBus.off("click-flashcard-action", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-noneditableblock",
                click: () => {
                    this.eventBus.on("open-noneditableblock", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-noneditableblock",
                click: () => {
                    this.eventBus.off("open-noneditableblock", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On loaded-protyle-static",
                click: () => {
                    this.eventBus.on("loaded-protyle-static", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off loaded-protyle-static",
                click: () => {
                    this.eventBus.off("loaded-protyle-static", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On loaded-protyle-dynamic",
                click: () => {
                    this.eventBus.on("loaded-protyle-dynamic", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off loaded-protyle-dynamic",
                click: () => {
                    this.eventBus.off("loaded-protyle-dynamic", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On switch-protyle",
                click: () => {
                    this.eventBus.on("switch-protyle", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off switch-protyle",
                click: () => {
                    this.eventBus.off("switch-protyle", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On destroy-protyle",
                click: () => {
                    this.eventBus.on("destroy-protyle", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off destroy-protyle",
                click: () => {
                    this.eventBus.off("destroy-protyle", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-doctree",
                click: () => {
                    this.eventBus.on("open-menu-doctree", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-doctree",
                click: () => {
                    this.eventBus.off("open-menu-doctree", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-blockref",
                click: () => {
                    this.eventBus.on("open-menu-blockref", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-blockref",
                click: () => {
                    this.eventBus.off("open-menu-blockref", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-fileannotationref",
                click: () => {
                    this.eventBus.on("open-menu-fileannotationref", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-fileannotationref",
                click: () => {
                    this.eventBus.off("open-menu-fileannotationref", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-tag",
                click: () => {
                    this.eventBus.on("open-menu-tag", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-tag",
                click: () => {
                    this.eventBus.off("open-menu-tag", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-link",
                click: () => {
                    this.eventBus.on("open-menu-link", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-link",
                click: () => {
                    this.eventBus.off("open-menu-link", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-image",
                click: () => {
                    this.eventBus.on("open-menu-image", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-image",
                click: () => {
                    this.eventBus.off("open-menu-image", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-av",
                click: () => {
                    this.eventBus.on("open-menu-av", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-av",
                click: () => {
                    this.eventBus.off("open-menu-av", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-content",
                click: () => {
                    this.eventBus.on("open-menu-content", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-content",
                click: () => {
                    this.eventBus.off("open-menu-content", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-breadcrumbmore",
                click: () => {
                    this.eventBus.on("open-menu-breadcrumbmore", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-breadcrumbmore",
                click: () => {
                    this.eventBus.off("open-menu-breadcrumbmore", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-menu-inbox",
                click: () => {
                    this.eventBus.on("open-menu-inbox", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-menu-inbox",
                click: () => {
                    this.eventBus.off("open-menu-inbox", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On input-search",
                click: () => {
                    this.eventBus.on("input-search", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off input-search",
                click: () => {
                    this.eventBus.off("input-search", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On paste",
                click: () => {
                    this.eventBus.on("paste", this.eventBusPaste);
                }
            }, {
                icon: "iconClose",
                label: "Off paste",
                click: () => {
                    this.eventBus.off("paste", this.eventBusPaste);
                }
            }, {
                icon: "iconSelect",
                label: "On open-siyuan-url-plugin",
                click: () => {
                    this.eventBus.on("open-siyuan-url-plugin", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-siyuan-url-plugin",
                click: () => {
                    this.eventBus.off("open-siyuan-url-plugin", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On open-siyuan-url-block",
                click: () => {
                    this.eventBus.on("open-siyuan-url-block", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off open-siyuan-url-block",
                click: () => {
                    this.eventBus.off("open-siyuan-url-block", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On opened-notebook",
                click: () => {
                    this.eventBus.on("opened-notebook", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off opened-notebook",
                click: () => {
                    this.eventBus.off("opened-notebook", this.eventBusLog);
                }
            }, {
                icon: "iconSelect",
                label: "On closed-notebook",
                click: () => {
                    this.eventBus.on("closed-notebook", this.eventBusLog);
                }
            }, {
                icon: "iconClose",
                label: "Off closed-notebook",
                click: () => {
                    this.eventBus.off("closed-notebook", this.eventBusLog);
                }
            }]
        });
        menu.addSeparator();
        menu.addItem({
            icon: "iconSparkles",
            label: this.data[STORAGE_NAME].readonlyText || "Readonly",
            type: "readonly",
        });
        if (this.isMobile) {
            menu.fullscreen();
        } else {
            menu.open({
                x: rect.right,
                y: rect.bottom,
                isLeft: true,
            });
        }
    }

}
