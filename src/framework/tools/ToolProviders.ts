export interface ToolProviderContext {
    tenantId: string;
    agentId: string;
    threadId: string;
    capabilities: string[];
    taskId?: string;
    leaseId?: string;
    idempotencyKey?: string;
}

export interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
}

export interface WebSearchProvider {
    search(query: string, options: { numResults: number }, context: ToolProviderContext): Promise<WebSearchResult[]>;
}

export interface DatabaseQueryProvider {
    query(query: string, context: ToolProviderContext): Promise<unknown>;
}

export interface RagSearchResult {
    content: string;
    source?: string;
    score?: number;
    metadata?: Record<string, unknown>;
}

export interface RagSearchProvider {
    search(contextQuery: string, options: { namespace?: string }, context: ToolProviderContext): Promise<RagSearchResult[]>;
}

export interface ToolProviderSet {
    webSearch?: WebSearchProvider;
    databaseQuery?: DatabaseQueryProvider;
    ragSearch?: RagSearchProvider;
}

export class ToolProviderRegistry {
    private providers: ToolProviderSet = {};

    constructor(providers: ToolProviderSet = {}) {
        this.providers = { ...providers };
    }

    public registerWebSearchProvider(provider: WebSearchProvider): void {
        this.providers.webSearch = provider;
    }

    public registerDatabaseQueryProvider(provider: DatabaseQueryProvider): void {
        this.providers.databaseQuery = provider;
    }

    public registerRagSearchProvider(provider: RagSearchProvider): void {
        this.providers.ragSearch = provider;
    }

    public getWebSearchProvider(): WebSearchProvider | undefined {
        return this.providers.webSearch;
    }

    public getDatabaseQueryProvider(): DatabaseQueryProvider | undefined {
        return this.providers.databaseQuery;
    }

    public getRagSearchProvider(): RagSearchProvider | undefined {
        return this.providers.ragSearch;
    }
}

export const globalToolProviders = new ToolProviderRegistry();
