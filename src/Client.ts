// tslint:disable-next-line import-name no-require-imports
import { IGenericWebSocket, ISocketOptions, Socket } from '@mixer/chat-client-websocket';
import { all } from 'deepmerge';
import * as querystring from 'querystring';

import { OAuthProvider } from './providers/OAuth';
import { Provider } from './providers/Provider';
import {
    DefaultRequestRunner,
    IOptionalUrlRequestOptions,
    IRequestOptions,
    IRequestRunner,
    IResponse,
} from './RequestRunner';

import { ChannelService } from './services/Channel';
import { ChatService } from './services/Chat';
import { ClipsService } from './services/Clips';
import { GameService } from './services/Game';

// DO NOT EDIT, THIS IS UPDATE BY THE BUILD SCRIPT
const packageVersion = '0.13.0'; // package version

/**
 * Main client.
 */
export class Client {
    private provider: Provider|OAuthProvider;
    private userAgent: string;
    public urls: { api: { [version: string]: string }, public: string } = {
        api: {
            v1: 'https://mixer.com/api/v1',
            v2: 'https://mixer.com/api/v2',
        },
        public: 'https://mixer.com',
    };

    public channel = new ChannelService(this);
    public chat = new ChatService(this);
    public clips = new ClipsService(this);
    public game = new GameService(this);

    /**
     * The primary Mixer client, responsible for storing authentication state
     * and dispatching requests to the API.
     */
    constructor(private requestRunner?: IRequestRunner) {
        this.userAgent = this.buildUserAgent();
        if (!requestRunner) {
            this.requestRunner = new DefaultRequestRunner();
        }
    }

    private buildUserAgent() {
        const client = `MixerClient/${packageVersion}`;
        // tslint:disable-next-line no-typeof-undefined
        if (typeof navigator !== 'undefined') {
            // in-browser
            return navigator.userAgent + ' ' + client;
        }

        return client + ' (JavaScript; Node.js ' + process.version + ')';
    }

    /**
     * Sets the the API/public URLs for the client.
     *
     * If you are changing the URL for the API, you can set the version to which to set with the URL given.
     */
    public setUrl(kind: 'api' | 'public', url: string, apiVer: 'v1' | 'v2' = 'v1'): this {
        if (kind === 'api') {
            this.urls.api[apiVer] = url;
        } else {
            this.urls[kind] = url;
        }
        return this;
    }

    /**
     * Builds a path to the Mixer API by concating it with the address.
     */
    public buildAddress(base: string, path: string, querystr?: string | Object): string {
        let url = base;

        // Strip any trailing slash from the base
        if (url.slice(-1) === '/') {
            url = url.slice(0, -1);
        }
        let sanitizedPath = path;
        // And any leading slash from the path.
        if (sanitizedPath.charAt(0) === '/') {
            sanitizedPath = sanitizedPath.slice(1);
        }

        url = url + '/' + sanitizedPath;

        // And just add the query string
        if (querystr) {
            url += '?' + querystring.stringify(querystr);
        }

        return url;
    }

    /**
     * Creates and returns an authentication provider instance.
     */
    public use(provider: Provider|OAuthProvider): Provider|OAuthProvider {
        this.provider = provider;
        return provider;
    }

    /**
     * Returns the associated provider instance, as set by the
     * `use` method.
     */
    public getProvider(): Provider {
        return this.provider;
    }

    /**
     * Attempts to run a given request.
     */
    public request<T>(
        method: string,
        path: string,
        data: IOptionalUrlRequestOptions = {},
        apiVer: string = 'v1',
    ): Promise<IResponse<T>> {
        let apiBase: string = this.urls.api[apiVer.toLowerCase()];
        if (!apiBase) { // Default back to v1 if the one given is invalid.
            apiBase = this.urls.api.v1;
        }
        const req = all([
            this.provider ? this.provider.getRequest() : {},
            {
                method: method || '',
                url: this.buildAddress(apiBase, path || ''),
                headers: {
                    'User-Agent': this.userAgent,
                },
                json: true,
            },
            data,
        ]);

        return this.requestRunner.run(<IRequestOptions>req).catch(err => {
            if (this.provider) {
                return this.provider.handleResponseError(err, <IRequestOptions>req);
            }
            throw err;
        });
    }

    public createChatSocket(
        ws: IGenericWebSocket,
        endpoints: string[],
        options: ISocketOptions,
    ): Socket {
        return new Socket(ws, endpoints, {
            clientId: this.provider instanceof OAuthProvider ? this.provider.getClientId() : null,
            ...options,
        });
    }
}
