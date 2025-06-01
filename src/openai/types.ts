export interface OpenAICompatibleTool {
	type: "function";
	function: {
		name: string;
		description?: string;
		parameters: unknown;
	};
}
// system message

export interface OpenAICompatibleSystemMessage {
	role: "system";
	content: string;
}

export interface OpenAICompatibleMessageToolCall {
	type: "function";
	id: string;
	function: {
		arguments: string;
		name: string;
	};
}

// assistant message

export interface OpenAICompatibleAssistantMessage {
	role: "assistant";
	content?: string | null;
	tool_calls?: OpenAICompatibleMessageToolCall[];
}

export interface OpenAICompatibleToolMessage {
	role: "tool";
	content: string;
	tool_call_id: string;
}

export interface OpenAICompatibleImageContent {
	type: "image_url";
	image_url: { url: string };
}

export interface OpenAICompatibleTextContent {
	type: "text";
	text: string;
}

export type OpenAICompatibleContentPart =
	| OpenAICompatibleTextContent
	| OpenAICompatibleImageContent;

// user message

export interface OpenAICompatibleUserMessage {
	role: "user";
	content: string | OpenAICompatibleContentPart[];
}

export type OpenAICompatibleMessage =
	| OpenAICompatibleSystemMessage
	| OpenAICompatibleUserMessage
	| OpenAICompatibleAssistantMessage
	| OpenAICompatibleToolMessage;
