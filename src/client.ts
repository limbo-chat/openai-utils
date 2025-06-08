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
