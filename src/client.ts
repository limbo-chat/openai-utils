import type * as limbo from "limbo";
import {
	convertMessagesToOpenAICompatible,
	convertToolIdToOpenAICompatible,
	convertToolsToOpenAICompatible,
} from "./utils";

export declare namespace ClientAdapter {
	export interface RequestOptions {
		url: string;
		method: string;
		body?: string;
		headers?: Record<string, string>;
		abortSignal?: AbortSignal;
	}
}

export interface ClientAdapter {
	requestStream(opts: ClientAdapter.RequestOptions): AsyncGenerator<string, void, unknown>;
}

export class FetchAdapter implements ClientAdapter {
	async *requestStream(opts: ClientAdapter.RequestOptions) {
		const response = await fetch(opts.url, {
			method: opts.method,
			headers: opts.headers,
			body: opts.body,
			signal: opts.abortSignal,
		});

		if (!response.ok) {
			throw new Error(`Fetch error: ${response.status} ${response.statusText}`);
		}

		if (!response.body) {
			throw new Error("Response body is not readable");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		try {
			while (true) {
				const readResult = await reader.read();

				if (readResult.done) {
					break;
				}

				const chunk = decoder.decode(readResult.value, { stream: true });

				yield chunk;
			}
		} finally {
			reader.releaseLock();
		}
	}
}

export declare namespace OpenAICompatibleClient {
	export interface Options {
		adapter: ClientAdapter;
		baseUrl: string;
		apiKey?: string;
	}

	export interface RequestOptions {
		path: string;
		method: string;
		body?: string;
		json?: boolean;
		headers?: Record<string, string>;
		abortSignal?: AbortSignal;
	}
}

export class OpenAICompatibleClient {
	private adapter: ClientAdapter;
	private baseUrl: string;
	private apiKey: string | null;

	constructor(opts: OpenAICompatibleClient.Options) {
		this.adapter = opts.adapter;
		this.baseUrl = opts.baseUrl;
		this.apiKey = opts.apiKey ?? null;
	}

	public async requestStream(opts: OpenAICompatibleClient.RequestOptions) {
		const headers = new Headers(opts.headers);

		if (opts.json) {
			headers.set("Content-Type", "application/json");
		}

		if (this.apiKey) {
			headers.set("Authorization", `Bearer ${this.apiKey}`);
		}

		return this.adapter.requestStream({
			url: this.baseUrl + opts.path,
			method: opts.method,
			body: opts.body,
			headers: Object.fromEntries(headers.entries()),
			abortSignal: opts.abortSignal,
		});
	}
}

export declare namespace streamOpenAICompatibleChatCompletion {
	export interface Options {
		model: string;
		tools?: limbo.LLM.Tool[];
		messages: limbo.ChatPromptMessage[];
		abortSignal?: AbortSignal;
		onText: (text: string) => void;
		onToolCall: (toolCall: limbo.LLM.ToolCall) => void;
	}
}

export async function streamOpenAICompatibleChatCompletion(
	client: OpenAICompatibleClient,
	opts: streamOpenAICompatibleChatCompletion.Options
) {
	const openAIMessages = convertMessagesToOpenAICompatible(opts.messages);

	let openAITools;

	const originalToolIdMap = new Map<string, string>();

	if (opts.tools) {
		openAITools = convertToolsToOpenAICompatible(opts.tools);

		for (const tool of opts.tools) {
			const openAICompatibleId = convertToolIdToOpenAICompatible(tool.id);

			originalToolIdMap.set(openAICompatibleId, tool.id);
		}
	}

	const stream = await client.requestStream({
		path: "/chat/completions",
		method: "POST",
		json: true,
		body: JSON.stringify({
			model: opts.model,
			messages: openAIMessages,
			tools: openAITools,
			stream: true,
		}),
		abortSignal: opts.abortSignal,
	});

	const collectedToolCalls: { id: string; arguments: string }[] = [];

	for await (const chunk of stream) {
		const lines = chunk.split("\n") as string[];

		for (const line of lines) {
			const trimmedLine = line.trim();

			if (trimmedLine === "" || !trimmedLine.startsWith("data:")) {
				continue;
			}

			if (trimmedLine === "data: [DONE]") {
				break;
			}

			const jsonData = trimmedLine.slice(6); // Remove 'data: ' prefix

			let parsed;

			try {
				parsed = JSON.parse(jsonData);
			} catch {
				continue;
			}

			const delta = parsed?.choices[0]?.delta;

			if (!delta) {
				continue;
			}

			const text = delta?.content;
			const partialToolCalls = delta.tool_calls;

			if (text) {
				opts.onText(text);
			}

			if (partialToolCalls) {
				for (const partialToolCall of partialToolCalls) {
					const toolInfo = partialToolCall.function;

					if (!toolInfo) {
						continue;
					}

					const partialToolCallIdx = partialToolCall.index;

					if (typeof partialToolCallIdx !== "number") {
						continue;
					}

					const toolCall = collectedToolCalls[partialToolCallIdx];

					if (toolCall) {
						if (toolInfo.name) {
							// note: not sure if the name can be added to during the stream
							toolCall.id += toolInfo.name;
						}

						if (typeof toolInfo.arguments === "string") {
							toolCall.arguments += toolInfo.arguments;
						}
					} else {
						collectedToolCalls.push({
							id: toolInfo.name,
							arguments: toolInfo.arguments || "",
						});
					}
				}
			}
		}
	}

	for (const collectedToolCall of collectedToolCalls) {
		const originalToolId = originalToolIdMap.get(collectedToolCall.id);

		if (!originalToolId) {
			// this will probably never happen
			throw new Error(`Unknown tool call ID: ${collectedToolCall.id}`);
		}

		let parsedArguments;

		try {
			parsedArguments = JSON.parse(collectedToolCall.arguments);
		} catch {
			throw new Error("Failed to parse tool call arguments as JSON");
		}

		opts.onToolCall({
			toolId: originalToolId,
			arguments: parsedArguments,
		});
	}
}
