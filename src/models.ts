import type * as limbo from "limbo";
import { OpenAICompatibleClient } from "./client";
import { convertMessagesToOpenAICompatible, convertToolsToOpenAICompatible } from "./utils";

export declare namespace createOpenAICompatibleLLM {
	export interface Options extends limbo.LLM {
		baseUrl: string;
		apiKey?: string;
		model: string;
	}
}

export function createOpenAICompatibleLLM({
	model,
	baseUrl,
	apiKey,
	...llmOpts
}: createOpenAICompatibleLLM.Options): limbo.LLM {
	const client = new OpenAICompatibleClient({
		baseUrl,
		apiKey,
	});

	return {
		...llmOpts,
		streamText: async ({ tools, messages, onText, onToolCall }) => {
			const openAICompatibleTools = convertToolsToOpenAICompatible(tools);
			const openAICompatibleMessages = convertMessagesToOpenAICompatible(messages);

			const response = await client.streamChatCompletion({
				model,
				messages: openAICompatibleMessages,
				tools: openAICompatibleTools,
				// abortSignal: llmOpts.abortSignal,
			});

			for await (const chunk of response) {
			}
		},
	};
}
