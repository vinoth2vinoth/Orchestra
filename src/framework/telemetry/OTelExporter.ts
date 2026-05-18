import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace, Span } from '@opentelemetry/api';

/**
 * Distributed Telemetry Exporter
 * 
 * Local-First: Defaults to Console and internal event store.
 * Only exports to OTLP if an endpoint is explicitly provided.
 */
export class OTelExporter {
    private sdk: NodeSDK;
    private tracer = trace.getTracer('orchestra-agent-framework');

    constructor() {
        const endpoint = process.env.OTLP_ENDPOINT;
        const isDisabled = process.env.DISABLE_TELEMETRY === 'true' || process.env.OTLP_ENDPOINT === 'none';
        const exporters: any[] = [];

        if (isDisabled) {
            this.sdk = new NodeSDK({ resource: resourceFromAttributes({}) });
            return;
        }

        // Always use Console in dev for visibility, or only if no endpoint provided
        if (!endpoint || endpoint === 'local') {
            exporters.push(new ConsoleSpanExporter());
        }

        if (endpoint && endpoint !== 'local' && endpoint !== '' && endpoint !== 'none') {
            exporters.push(new OTLPTraceExporter({ url: endpoint }));
        } else if (!isDisabled) {
            console.log(`[OTelExporter] Local-only mode active. Traces preserved in memory and console.`);
        }

        const resource = resourceFromAttributes({
            [SemanticResourceAttributes.SERVICE_NAME]: 'orchestra-swarm',
            [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
        });

        // --- PERFORMANCE: Batching (Dimension 04) ---
        // BatchSpanProcessor is non-blocking and groups spans for efficient network usage
        this.sdk = new NodeSDK({
            resource,
            spanProcessors: exporters.map(exp => new BatchSpanProcessor(exp, {
                maxQueueSize: 2048,
                scheduledDelayMillis: 5000, // Export every 5 seconds to minimize network jitter
            }))
        });
        
        try {
            this.sdk.start();
        } catch (err) {
            console.error('[OTelExporter] Error initializing OpenTelemetry SDK', err);
        }

        process.on('SIGTERM', () => {
            this.sdk.shutdown()
                .then(() => console.log('[OTelExporter] OpenTelemetry SDK shut down'))
                .catch((error) => console.log('[OTelExporter] Error shutting down OpenTelemetry SDK', error));
        });
    }

    public getTracer() {
        return this.tracer;
    }
}

export const globalOTelExporter = new OTelExporter();
