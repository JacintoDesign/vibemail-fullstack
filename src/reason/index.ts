import { ProviderError } from '../types/provider';
import { ReasonArgs, ReasonProvider, ReasonResult } from '../types/reason';
import * as gemini from './gemini';

export type {
  ReasonArgs,
  ReasonContextMessage,
  ReasonProvider,
  ReasonResult,
} from '../types/reason';

function getProvider(): ReasonProvider {
  const name = (process.env.REASON_PROVIDER ?? 'gemini').trim().toLowerCase();
  switch (name) {
    case 'gemini':
      return gemini;
    default:
      throw new ProviderError(
        'CONFIG_ERROR',
        `Unknown REASON_PROVIDER "${name}". Supported: gemini`,
      );
  }
}

/**
 * Run a grounded reasoning call against the configured provider.
 * Default provider is Gemini (`REASON_PROVIDER=gemini`). Sibling files can
 * be added later and selected with the same env var.
 */
export async function reason(args: ReasonArgs): Promise<ReasonResult> {
  return getProvider().reason(args);
}
