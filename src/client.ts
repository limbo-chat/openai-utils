import type { OpenAICompatibleMessage, OpenAICompatibleTool } from "./types";

export declare namespace OpenAICompatibleClient {
	export interface Options {
		baseUrl: string;
		apiKey?: string;
	}

	export interface StreamChatCompletionOptions {
		model: string;
		messages: OpenAICompatibleMessage[];
		tools?: OpenAICompatibleTool[];
		abortSignal?: AbortSignal;
	}
}

export class OpenAICompatibleClient {
	private baseUrl: string;
	private apiKey: string | null;

	constructor(opts: OpenAICompatibleClient.Options) {
		this.baseUrl = opts.baseUrl;
		this.apiKey = opts.apiKey ?? null;
	}

	public async *streamChatCompletion(opts: OpenAICompatibleClient.StreamChatCompletionOptions) {
		const requestHeaders = this.createRequestHeaders();

		const response = await fetch(`${this.baseUrl}/chat/completions`, {
			headers: requestHeaders,
			signal: opts.abortSignal,
			body: JSON.stringify({
				model: opts.model,
				messages: opts.messages,
				tools: opts.tools,
				stream: true,
			}),
		});

		if (!response.ok || !response.body) {
			throw new Error(`Failed to stream chat completion: ${response.statusText}`);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder("utf8");

		try {
			let buffer = "";

			while (true) {
				const readResult = await reader.read();

				if (readResult.done) {
					break;
				}

				const chunk = readResult.value;

				buffer += decoder.decode(chunk, { stream: true });

				while (true) {
					const lineEndIdx = buffer.indexOf("\n");

					// no complete line available yet
					if (lineEndIdx === -1) {
						break;
					}

					const line = buffer.slice(0, lineEndIdx).trim();

					buffer = buffer.slice(lineEndIdx + 1);

					if (line.startsWith("data: ")) {
						const rawData = line.slice(6);

						if (rawData === "[DONE]") {
							break;
						}

						let parsedData;

						try {
							parsedData = JSON.parse(rawData);
						} catch {
							// noop, ignore
						}

						// what should this be named?
						const delta = parsedData.choices[0].delta;

						if (delta) {
							yield delta;
						}
					}
				}
			}
		} catch (error) {
		} finally {
			reader.releaseLock();
		}
	}

	private createRequestHeaders(): Headers {
		const headers = new Headers();

		headers.set("Content-Type", "application/json");

		if (this.apiKey !== null) {
			headers.set("Authorization", `Bearer ${this.apiKey}`);
		}

		return headers;
	}
}
