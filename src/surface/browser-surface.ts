import { chromium, type Browser, type BrowserContext, type Frame, type FrameLocator, type Locator, type Page } from "playwright";
import type { Action, Condition, LocatorCandidate } from "../contracts/action.js";
import type { JsonPrimitive } from "../contracts/common.js";
import { evaluateValue, type ActionResult, type HumanActionRecord, type InteractiveElement, type Observation, type Surface, SurfaceFailure } from "./surface.js";

type LocatorScope = Page | FrameLocator;

export interface BrowserSurfaceOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  slowMoMs?: number;
}

export class BrowserSurface implements Surface {
  private humanControlActive = false;
  private humanActions: HumanActionRecord[] = [];

  private constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    readonly page: Page,
  ) {}

  static async launch(options: BrowserSurfaceOptions = {}): Promise<BrowserSurface> {
    const launchOptions = { headless: options.headless ?? true, slowMo: options.slowMoMs ?? 0 };
    let browser: Browser;
    try {
      browser = await chromium.launch(launchOptions);
    } catch (error) {
      if (process.platform !== "win32") throw error;
      browser = await chromium.launch({ ...launchOptions, channel: "msedge" });
    }
    const context = await browser.newContext({ viewport: options.viewport ?? { width: 1280, height: 800 } });
    const page = await context.newPage();
    const surface = new BrowserSurface(browser, context, page);
    await surface.installHumanActionCapture();
    return surface;
  }

  async observe(): Promise<Observation> {
    const screenshot = await this.page.screenshot({ fullPage: true });
    const frames = this.page.frames();
    const visibleTextParts: string[] = [];
    const elements: InteractiveElement[] = [];
    for (const [frameIndex, frame] of frames.entries()) {
      const bodyText = await frame.locator("body").innerText().catch(() => "");
      if (bodyText) visibleTextParts.push(bodyText);
      const frameElements = await this.inventoryFrame(frame, frameIndex);
      elements.push(...frameElements);
    }
    return {
      url: this.currentApplicationUrl(),
      title: await this.page.title(),
      visibleText: visibleTextParts.join("\n--- frame ---\n"),
      elements,
      screenshot: Buffer.from(screenshot),
    };
  }

  async perform(action: Action, inputs: Record<string, JsonPrimitive>, timeoutMs: number): Promise<ActionResult> {
    try {
      if (action.type === "navigate") {
        const url = String(evaluateValue(action.url, inputs));
        await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      } else if (action.type === "wait") {
        await this.page.waitForTimeout(action.durationMs);
      } else if (action.type === "click") {
        const resolved = await this.resolve(action.target, timeoutMs);
        if (resolved.kind === "coordinate") await this.page.mouse.click(resolved.x, resolved.y);
        else await resolved.locator.click({ timeout: timeoutMs });
      } else if (action.type === "type") {
        const resolved = await this.resolve(action.target, timeoutMs);
        if (resolved.kind === "coordinate") throw new SurfaceFailure("surface_error", "coordinate targets cannot receive deterministic text input");
        await resolved.locator.fill(String(evaluateValue(action.value, inputs)), { timeout: timeoutMs });
      } else if (action.type === "select") {
        const resolved = await this.resolve(action.target, timeoutMs);
        if (resolved.kind === "coordinate") throw new SurfaceFailure("surface_error", "coordinate targets cannot select deterministic options");
        await resolved.locator.selectOption(String(evaluateValue(action.value, inputs)), { timeout: timeoutMs });
      }
      return { url: this.page.url(), title: await this.page.title() };
    } catch (error) {
      if (error instanceof SurfaceFailure) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout/i.test(message)) throw new SurfaceFailure("timeout", message, true);
      throw new SurfaceFailure("surface_error", message);
    }
  }

  async check(condition: Condition, inputs: Record<string, JsonPrimitive>, timeoutMs: number): Promise<boolean> {
    try {
      if (condition.type === "url_matches") return new RegExp(condition.pattern).test(this.currentApplicationUrl());
      if (condition.type === "page_contains") {
        const expected = String(evaluateValue(condition.value, inputs));
        const observation = await this.observe();
        return observation.visibleText.includes(expected);
      }
      const resolved = await this.resolve(condition.target, timeoutMs);
      if (resolved.kind === "coordinate") return condition.type === "visible";
      if (condition.type === "visible") return resolved.locator.isVisible();
      if (condition.type === "not_visible") return !(await resolved.locator.isVisible());
      if (condition.type === "text_contains") {
        const actual = await resolved.locator.innerText({ timeout: timeoutMs });
        return actual.includes(String(evaluateValue(condition.value, inputs)));
      }
      return false;
    } catch (error) {
      if (error instanceof SurfaceFailure && (error.category === "locator_not_found" || error.category === "locator_ambiguous")) return false;
      throw error;
    }
  }

  async extractText(target: Extract<Action, { type: "click" }>['target'], attribute: "text" | "value", timeoutMs: number): Promise<string> {
    const resolved = await this.resolve(target, timeoutMs);
    if (resolved.kind === "coordinate") throw new SurfaceFailure("surface_error", "coordinate targets cannot extract structured output");
    if (attribute === "value") return (await resolved.locator.inputValue({ timeout: timeoutMs })).trim();
    return (await resolved.locator.innerText({ timeout: timeoutMs })).trim();
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }

  async beginHumanControl(): Promise<void> {
    this.humanActions = [];
    this.humanControlActive = true;
  }

  async endHumanControl(): Promise<HumanActionRecord[]> {
    this.humanControlActive = false;
    return [...this.humanActions];
  }

  private async installHumanActionCapture(): Promise<void> {
    await this.context.exposeBinding("__ucrRecordHumanAction", ({ frame }, payload: unknown) => {
      if (!this.humanControlActive || !payload || typeof payload !== "object") return;
      const event = payload as { kind?: string; target?: string; value?: string };
      if (event.kind !== "click" && event.kind !== "change") return;
      this.humanActions.push({
        timestamp: new Date().toISOString(),
        kind: event.kind,
        ...(frame.name() ? { frameName: frame.name() } : {}),
        ...(event.target ? { target: event.target } : {}),
        ...(event.value ? { value: "[REDACTED]" as const } : {}),
      });
    });
    await this.context.addInitScript(() => {
      const describe = (node: EventTarget | null): string => {
        if (!(node instanceof HTMLElement)) return "unknown";
        const label = node.id ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent?.trim() : undefined;
        return node.getAttribute("aria-label") ?? label ?? node.innerText?.trim() ?? node.getAttribute("name") ?? node.tagName.toLowerCase();
      };
      document.addEventListener("click", (event) => {
        void (window as unknown as { __ucrRecordHumanAction: (payload: unknown) => Promise<void> }).__ucrRecordHumanAction({ kind: "click", target: describe(event.target) });
      }, true);
      document.addEventListener("change", (event) => {
        const input = event.target as HTMLInputElement | HTMLSelectElement | null;
        void (window as unknown as { __ucrRecordHumanAction: (payload: unknown) => Promise<void> }).__ucrRecordHumanAction({ kind: "change", target: describe(event.target), value: input?.value ? "present" : undefined });
      }, true);
    });
    this.page.on("framenavigated", (frame) => {
      if (!this.humanControlActive) return;
      let safeUrl = frame.url();
      try {
        const parsed = new URL(frame.url());
        safeUrl = `${parsed.origin}${parsed.pathname}`;
      } catch {
        safeUrl = "[UNPARSEABLE_URL]";
      }
      this.humanActions.push({
        timestamp: new Date().toISOString(),
        kind: "navigation",
        ...(frame.name() ? { frameName: frame.name() } : {}),
        url: safeUrl,
      });
    });
  }

  private currentApplicationUrl(): string {
    return this.page.url();
  }

  private async inventoryFrame(frame: Frame, frameIndex: number): Promise<InteractiveElement[]> {
    const raw = await frame.locator("a,button,input,select,textarea,output,[data-output],[role],span[class]").evaluateAll((nodes) =>
      nodes.map((node, index) => {
        const element = node as HTMLElement;
        const input = element as HTMLInputElement;
        const select = element as HTMLSelectElement;
        const rect = element.getBoundingClientRect();
        const label = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent?.trim() : undefined;
        const name = element.getAttribute("aria-label") ?? label ?? element.innerText?.trim() ?? input.value ?? element.getAttribute("name") ?? "";
        const tag = element.tagName.toLowerCase();
        const inferredRole = element.getAttribute("role") ?? (tag === "a" ? "link" : tag === "button" ? "button" : tag === "select" ? "combobox" : tag === "input" || tag === "textarea" ? "textbox" : undefined);
        const nameAttribute = element.getAttribute("name") ?? undefined;
        const classes = [...element.classList];
        return {
          index,
          tag,
          role: inferredRole,
          label,
          name,
          nameAttribute,
          classes,
          type: input.type || undefined,
          value: input.type === "password" ? "[REDACTED]" : input.value || undefined,
          options: tag === "select" ? [...select.options].map((option) => ({ value: option.value, label: option.textContent?.trim() ?? option.value })) : undefined,
          interactive: ["a", "button", "input", "select", "textarea"].includes(tag) || element.hasAttribute("role"),
          disabled: input.disabled || element.getAttribute("aria-disabled") === "true",
          bounds: rect.width > 0 && rect.height > 0 ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined,
        };
      }),
    ).catch(() => []);
    const framePath = this.framePathFor(frame);
    return raw.map((element) => {
      const candidates: LocatorCandidate[] = [];
      if (element.label) candidates.push({ strategy: "label", label: element.label, framePath, exact: true });
      if (element.role && element.name) candidates.push({ strategy: "role", role: element.role, name: element.name, framePath, exact: true });
      const cssSelector = element.nameAttribute
        ? `${element.tag}[name=${JSON.stringify(element.nameAttribute)}]`
        : element.classes.length
          ? `${element.tag}.${element.classes.map((name) => name.replace(/[^a-zA-Z0-9_-]/g, "")).filter(Boolean).join(".")}`
          : element.tag;
      candidates.push({ strategy: "css", selector: cssSelector, framePath, exact: true });
      return {
        elementId: `f${frameIndex}-e${element.index}`,
        ...(frame.name() ? { frameName: frame.name() } : {}),
        tag: element.tag,
        ...(element.role ? { role: element.role } : {}),
        name: element.name,
        ...(element.type ? { type: element.type } : {}),
        ...(element.value ? { value: element.value } : {}),
        ...(element.options ? { options: element.options } : {}),
        interactive: element.interactive,
        disabled: element.disabled,
        ...(element.bounds ? { bounds: element.bounds } : {}),
        target: { description: element.name || `${element.tag} element`, candidates, requireUnique: true },
      };
    });
  }

  private framePathFor(frame: Frame): LocatorCandidate["framePath"] {
    const path: LocatorCandidate["framePath"] = [];
    let current: Frame | null = frame;
    while (current && current !== this.page.mainFrame()) {
      const parent = current.parentFrame();
      if (!parent) break;
      const name = current.name();
      if (name) path.unshift({ name });
      else {
        const index = parent.childFrames().indexOf(current);
        if (index < 0) throw new SurfaceFailure("surface_error", "could not locate frame within its parent");
        path.unshift({ index });
      }
      current = parent;
    }
    return path;
  }

  private scopeFor(candidate: LocatorCandidate): LocatorScope {
    let scope: LocatorScope = this.page;
    for (const frame of candidate.framePath) {
      if (frame.name) scope = scope.frameLocator(`iframe[name=${JSON.stringify(frame.name)}]`);
      else if (frame.index !== undefined) scope = scope.frameLocator("iframe").nth(frame.index);
      else throw new SurfaceFailure("surface_error", "frame locator requires a name or index in the browser implementation");
    }
    return scope;
  }

  private locatorFor(candidate: Exclude<LocatorCandidate, { strategy: "coordinate" }>): Locator {
    const scope = this.scopeFor(candidate);
    if (candidate.strategy === "role") return scope.getByRole(candidate.role as never, { name: candidate.name, exact: candidate.exact });
    if (candidate.strategy === "label") return scope.getByLabel(candidate.label, { exact: candidate.exact });
    if (candidate.strategy === "text") {
      const locator = scope.getByText(candidate.text, { exact: candidate.exact });
      return candidate.withinText ? locator.filter({ has: scope.getByText(candidate.withinText, { exact: false }) }) : locator;
    }
    return scope.locator(candidate.selector);
  }

  private async resolve(target: Extract<Action, { type: "click" }>['target'], _timeoutMs: number): Promise<{ kind: "locator"; locator: Locator } | { kind: "coordinate"; x: number; y: number }> {
    let sawAmbiguous = false;
    for (const candidate of target.candidates) {
      if (candidate.strategy === "coordinate") {
        const viewport = this.page.viewportSize();
        if (!viewport) continue;
        return { kind: "coordinate", x: candidate.x * (viewport.width / candidate.viewportWidth), y: candidate.y * (viewport.height / candidate.viewportHeight) };
      }
      const locator = this.locatorFor(candidate);
      const count = await locator.count();
      if (count === 0) continue;
      if (target.requireUnique && count !== 1) {
        sawAmbiguous = true;
        continue;
      }
      return { kind: "locator", locator: target.requireUnique ? locator : locator.first() };
    }
    if (sawAmbiguous) throw new SurfaceFailure("locator_ambiguous", `all matching locator candidates were ambiguous for ${target.description}`);
    throw new SurfaceFailure("locator_not_found", `no locator candidate matched ${target.description}`);
  }
}
