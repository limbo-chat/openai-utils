import type { OpenAICompatibleClient } from "./client";
import type { OpenAICompatibleMessage, OpenAICompatibleTool } from "./types";

export declare namespace streamOpenAICompatibleChatCompletion {
	export interface Options {
		model: string;
		tools?: OpenAICompatibleTool[];
		messages: OpenAICompatibleMessage[];
		abortSignal?: AbortSignal;
	}
}

export async function* streamOpenAICompatibleChatCompletion(
	client: OpenAICompatibleClient,
	opts: streamOpenAICompatibleChatCompletion.Options
) {
	const stream = await client.requestStream({
		path: "/chat/completions",
		method: "POST",
		json: true,
		body: JSON.stringify({
			model: opts.model,
			tools: opts.tools,
			messages: opts.messages,
			stream: true,
		}),
		abortSignal: opts.abortSignal,
	});

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

			if (delta) {
				yield delta;
			}
		}
	}
}
