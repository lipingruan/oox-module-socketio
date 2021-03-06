
import * as http from 'node:http'

import { Server, ServerOptions } from 'socket.io'

import * as oox from 'oox'

import { Module, ModuleConfig } from 'oox'

import { ServerSocket as Socket, sockets } from './socket'



export class SocketIOConfig extends ModuleConfig {
    // listen port
    port = 0
    // service path
    path = '/socket.io'
    // browser cross origin
    origin = ''
}



export default class SocketIOServer extends Module {
    


    name = 'socketio'



    config = new SocketIOConfig



    /**
     * means this.server created by myself<SocketIOServer>
     */
    #isSelfServer = false



    server: http.Server = null



    socketServer: Server = null



    setConfig ( config:SocketIOConfig ) {

        Object.assign ( this.config, config )

        if ( !config.hasOwnProperty ( 'port' ) ) {

            this.config.port = oox.config.port
        }

        if ( !config.hasOwnProperty ( 'origin' ) ) {

            this.config.origin = oox.config.origin
        }
    }
    
    
    
    getConfig ( ): SocketIOConfig {
    
        return this.config
    }



    async serve ( ) {

        await this.stop ( )

        const port = this.config.port

        const isSelfServer = this.#isSelfServer = this.server ? true : false

        const server = this.server = isSelfServer ? this.server : 
            http.createServer ( ( request, response ) => response.end ( 'No HTTP Gateway' ) )

        if ( !server.listening ) server.listen ( port )

        const address = server.address ( )
        
        if ( !address || 'object' !== typeof address ) throw new Error ( 'Cannot read socket.io server port' )
        
        this.config.port = address.port

        this.createSocketIOServer ( )
    }



    async stop ( ) {

        if ( this.socketServer )
        await new Promise<void> ( ( resolve, reject ) =>
            this.socketServer.close ( error => error ? reject ( error ) : resolve ( ) ) )

        if ( this.#isSelfServer ) 
        await new Promise<void> ( ( resolve, reject ) =>
            this.server.close ( error => error ? reject ( error ) : resolve ( ) ) )
    }



    genSocketIOServerOptions ( ) {

        const options: Partial<ServerOptions> = {
            /**
             * name of the path to capture
             * @default "/socket.io"
             */
            path: this.config.path,
            /**
             * how many ms before a client without namespace is closed
             * @default 45000
             */
            connectTimeout: 5000,
            /**
             * how many ms without a pong packet to consider the connection closed
             * @default 5000
             */
            pingTimeout: 2000,
            /**
             * how many ms before sending a new ping packet
             * @default 25000
             */
            pingInterval: 10000,
            /**
             * how many bytes or characters a message can be, before closing the session (to avoid DoS).
             * @default 1e5 (100 KB)
             */
            maxHttpBufferSize: 1e5
        }

        const { origin } = this.config

        if ( origin ) options.cors = { origin }

        return options
    }



    createSocketIOServer ( ) {

        const socketServer = this.socketServer = new Server ( this.server, this.genSocketIOServerOptions ( ) )

        socketServer.on ( 'connection', async (socket: Socket) => {

            try {

                this.serverOnSocketConnection(socket)
            } catch ( error ) {

                socket.send ( error.message ).disconnect ( true )
            }
        } )
    }



    /**
     * ?????????Socket????????????
     */
    serverOnSocketConnection ( socket: Socket ) {

        const headers = socket.handshake.headers

        const callerId = String ( headers [ 'x-caller-id' ] || '' ) || socket.id

        // ???????????????????????????
        if ( sockets.has ( callerId ) ) throw new Error ( 'Connection Exists' )

        // client ip or caller service ip
        const ip = String ( headers [ 'x-real-ip' ] || headers [ 'x-ip' ] || socket.handshake.address )

        // service name
        const caller = String ( headers [ 'x-caller' ] || 'anonymous' )

        socket.data = { connected: true, host: ip, name: caller, id: callerId }

        // ?????? callerId ??? socket ????????????
        sockets.set ( callerId, socket )

        socket.on ( 'disconnect', reason => this.serverOnSocketDisconnect ( socket, reason ) )

        socket.emit ( 'oox_connected', { name: oox.config.name } )

        this.serverOnConnection ( socket )
    }



    serverOnConnection ( socket: Socket ) { }



    /**
     * ?????????Socket????????????
     * @param {Socket} socket 
     * @param {Error} reason
     */
    serverOnSocketDisconnect ( socket: Socket, reason: string ) {

        socket.data.connected = false

        sockets.delete ( socket.data.id )

        this.serverOnDisconnect ( socket, reason )
    }



    serverOnDisconnect ( socket: Socket, reason: string ) { }
}