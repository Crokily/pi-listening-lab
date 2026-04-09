import "server-only";

import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

type ToolCapableModel = {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  input: string[];
  contextWindow: number;
  maxTokens: number;
};

interface PiServices {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
}

export interface ModelSummary {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  input: string[];
  contextWindow: number;
  maxTokens: number;
}

export interface PiEnvironmentStatus {
  ready: boolean;
  availableModelCount: number;
  availableModels: ModelSummary[];
  preferredModel: ModelSummary | null;
  warning: string | null;
}

declare global {
  var __piListeningLabPiServices: PiServices | undefined;
}

function createPiServices(): PiServices {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  return {
    authStorage,
    modelRegistry,
  };
}

export function getPiServices(): PiServices {
  if (!globalThis.__piListeningLabPiServices) {
    globalThis.__piListeningLabPiServices = createPiServices();
  }

  return globalThis.__piListeningLabPiServices;
}

export function refreshPiServices(): PiServices {
  const services = getPiServices();
  services.authStorage.reload();
  services.modelRegistry.refresh();
  return services;
}

export function pickPreferredModel<T extends ToolCapableModel>(models: T[]) {
  return [...models].sort((left, right) => {
    if (left.reasoning !== right.reasoning) {
      return Number(right.reasoning) - Number(left.reasoning);
    }

    if (left.contextWindow !== right.contextWindow) {
      return right.contextWindow - left.contextWindow;
    }

    if (left.maxTokens !== right.maxTokens) {
      return right.maxTokens - left.maxTokens;
    }

    const providerComparison = left.provider.localeCompare(right.provider);

    if (providerComparison !== 0) {
      return providerComparison;
    }

    return left.id.localeCompare(right.id);
  })[0];
}

export function serializeModel(model: ToolCapableModel | null | undefined) {
  if (!model) {
    return null;
  }

  return {
    provider: model.provider,
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
    input: [...model.input],
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  } satisfies ModelSummary;
}

export function getPiEnvironmentStatus(): PiEnvironmentStatus {
  const { modelRegistry } = refreshPiServices();
  const availableModels = modelRegistry
    .getAvailable()
    .sort((left, right) => {
      const providerComparison = left.provider.localeCompare(right.provider);

      if (providerComparison !== 0) {
        return providerComparison;
      }

      return left.id.localeCompare(right.id);
    });
  const preferredModel = pickPreferredModel(availableModels);
  const registryError = modelRegistry.getError();

  return {
    ready: Boolean(preferredModel),
    availableModelCount: availableModels.length,
    availableModels: availableModels
      .map((model) => serializeModel(model))
      .filter((model) => model !== null),
    preferredModel: serializeModel(preferredModel),
    warning:
      registryError ??
      (availableModels.length === 0
        ? "No pi model is currently available. Run `pi` and `/login` on this machine, or configure a supported provider API key, then create a new session."
        : null),
  };
}
