import { normalizeLearningImages } from "../utils/learningImages.js";

const DRAFT_PREFIX = "studyhub:learning-drafts:1:";

export function normalizeLearningDraft(value = {}) {
  return {
    learned: String(value.learned ?? "").slice(0, 1200),
    unresolved: String(value.unresolved ?? "").slice(0, 1200),
    nextSession: String(value.nextSession ?? "").slice(0, 1200),
    learnedImages: normalizeLearningImages(value.learnedImages),
  };
}

export function learningDraftStorageKey(accountId = "local") {
  return `${DRAFT_PREFIX}${encodeURIComponent(String(accountId || "local"))}`;
}

export class LearningDraftStore {
  constructor(storage = globalThis.localStorage, accountId = "local") {
    this.storage = storage;
    this.key = learningDraftStorageKey(accountId);
  }

  load() {
    if (!this.storage) return {};
    try {
      const parsed = JSON.parse(this.storage.getItem(this.key) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).map(([taskId, draft]) => [taskId, normalizeLearningDraft(draft)]));
    } catch {
      return {};
    }
  }

  save(drafts) {
    if (!this.storage) return;
    this.storage.setItem(this.key, JSON.stringify(drafts));
  }

  clear() {
    this.storage?.removeItem(this.key);
  }
}
