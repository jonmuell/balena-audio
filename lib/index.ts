import PulseAudio, {
	AuthInfo,
	ClientInfo,
	ServerInfo,
	Sink,
} from '@tmigone/pulseaudio';
import { retry } from 'ts-retry-promise';

export interface BalenaAudioInfo {
	client: ClientInfo;
	protocol: AuthInfo;
	server: ServerInfo;
}

export default class BalenaAudio extends PulseAudio {
	public defaultSink: string | undefined;
	public connected: boolean = false;

	constructor(
		public tcpAddress: string = 'tcp:audio:4317',
		public subToEvents: boolean = true,
		public name: string = 'BalenaAudio',
	) {
		super(tcpAddress);
	}

	async listen(): Promise<BalenaAudioInfo> {
		const protocol: AuthInfo = await this.connectWithRetry();
		const client: ClientInfo = await this.setClientName(this.name);
		const server: ServerInfo = await this.getServerInfo();

		this.defaultSink = server.defaultSink;

		if (this.subToEvents) {
			await this.subscribe();
			this.on('sink', async (data) => {
				const sink: Sink = await this.getSink(data.index);
				switch (sink.state) {
					// running
					case 0:
						this.emit('play', sink);
						break;

					// idle
					case 1:
						this.emit('stop', sink);
						break;

					// suspended
					case 2:
					default:
						break;
				}
			});
		}

		return { client, protocol, server };
	}

	async connectWithRetry(): Promise<AuthInfo> {
		return await retry(
			async () => {
				const authInfo = await this.connect();
				this.connected = true;
				return authInfo;
			},
			{
				retries: 'INFINITELY',
				delay: 1000,
				backoff: 'LINEAR',
				timeout: 10 * 60 * 1000,
				logger: (msg) => {
					console.log(`Error connecting to audio block - ${msg}`);
				},
			},
		);
	}

	checkConnected() {
		if (!this.connected) {
			throw new Error('Not connected to audio block.');
		}
	}

	async getInfo() {
		this.checkConnected();
		return await this.getServerInfo();
	}

	async setVolume(volume: number, sink?: string | number) {
		this.checkConnected();
		const sinkObject: Sink = await this.getSink(sink ?? this.defaultSink ?? 0);
		const level: number = Math.round(
			(Math.max(0, Math.min(volume, 100)) / 100) * sinkObject.baseVolume,
		);
		return await this.setSinkVolume(sinkObject.index, level);
	}

	async getVolume(sink?: string | number) {
		this.checkConnected();
		const sinkObject: Sink = await this.getSink(sink ?? this.defaultSink ?? 0);
		return Math.round(
			(sinkObject.channelVolume.volumes[0] / sinkObject.baseVolume) * 100,
		);
	}
}
