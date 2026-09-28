import { Injectable, Logger } from '@nestjs/common';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type LlmTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  get provider() {
    const explicit = (process.env.AI_PROVIDER || '').trim().toLowerCase();
    if (explicit) return explicit;
    if (process.env.GROQ_API_KEY) return 'groq';
    if (process.env.OPENAI_API_KEY) return 'openai';
    return 'gemini';
  }

  get model() {
    return process.env.AI_MODEL || this.defaultModel();
  }

  get apiKey() {
    const fromPrimary = (process.env.AI_API_KEY || '').trim();
    if (fromPrimary) return fromPrimary;
    if (this.provider === 'groq') return (process.env.GROQ_API_KEY || '').trim();
    if (this.provider === 'openai') return (process.env.OPENAI_API_KEY || '').trim();
    return (process.env.GEMINI_API_KEY || '').trim();
  }

  get llmEnabled() {
    return Boolean(this.apiKey);
  }

  status() {
    return {
      provider: this.provider,
      model: this.model,
      llmEnabled: this.llmEnabled,
    };
  }

  resolveModel(modelOverride?: string) {
    const fallback = this.model;
    if (!modelOverride?.trim()) return fallback;
    const override = modelOverride.trim();
    if (this.provider === 'groq' && /gemini|gpt-4|claude|llama-3/i.test(override)) return fallback;
    if (this.provider === 'gemini' && /llama|mixtral|groq/i.test(override)) return fallback;
    return override;
  }

  async complete(messages: ChatMessage[], modelOverride?: string): Promise<string | null> {
    const result = await this.chat(messages, { modelOverride });
    return result?.content?.trim() || null;
  }

  async chat(
    messages: ChatMessage[],
    opts?: { modelOverride?: string; tools?: LlmTool[]; toolChoice?: 'auto' | 'required' | 'none' },
  ): Promise<{ content: string | null; toolCalls: ToolCall[] } | null> {
    if (!this.llmEnabled) return null;
    const model = this.resolveModel(opts?.modelOverride);
    try {
      const { url, headers } = this.endpoint();
      const body: Record<string, unknown> = {
        model,
        temperature: 0.1,
        messages: messages.map((m) => {
          const row: Record<string, unknown> = { role: m.role, content: m.content ?? '' };
          if (m.tool_call_id) row.tool_call_id = m.tool_call_id;
          if (m.tool_calls) row.tool_calls = m.tool_calls;
          return row;
        }),
      };
      if (opts?.tools?.length) {
        body.tools = opts.tools;
        body.tool_choice = opts.toolChoice || 'auto';
      }
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(`LLM request failed ${res.status}: ${text.slice(0, 400)}`);
        return null;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
      };
      const message = data.choices?.[0]?.message;
      return {
        content: message?.content?.trim() || null,
        toolCalls: message?.tool_calls || [],
      };
    } catch (err) {
      this.logger.warn(`LLM request error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private defaultModel() {
    switch (this.provider) {
      case 'openai':
        return 'gpt-4o-mini';
      case 'groq':
        return 'openai/gpt-oss-20b';
      default:
        return 'gemini-2.0-flash';
    }
  }

  private endpoint() {
    const key = this.apiKey;
    if (this.provider === 'openai') {
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
      };
    }
    if (this.provider === 'groq') {
      return {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
      };
    }
    return {
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
    };
  }
}
