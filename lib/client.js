'use strict';
let EventEmitter = require("events").EventEmitter;
let debug = require("debug")("RPC-Client");
let Thrift = require("thrift");
let MasterService = require("./thrift/gen-nodejs/MasterService");
let pathToRegexp = require("path-to-regexp");
let os = require("os");
class Client extends EventEmitter{
    constructor ( serviceId, name, opts ){
        super();
        this.opts = opts || {};
        this.name = name;
        this.serviceId = serviceId;
        this.opts.type = this.opts.type || 'client';
        this.opts.max_attempts = this.opts.max_attempts == undefined ?  1000 * 60 * 60 * 8 : this.opts.max_attempts;
    }
    connect ( port, host ){
        this.port = port || 5551;
        this.host = host || 'localhost';
        let self = this;
        this.connection = Thrift.createConnection( this.host, this.port, { max_attempts : this.opts.max_attempts });
        this.connection.on('error',function(err){
            self.emit('error',err);
            self.client = null;
            delete self.client;
        });
        this.connection.on('close',function(){
            self.emit('close',self);
            self.client = null;
            delete self.client;
        });
        this.connection.on('connect',function(){
            self.client = Thrift.createClient(MasterService,this);
            self.emit('connect',self);
            debug(`connect success [ ${self.host}:${self.port} ]`)
        });
    }
    
    toResult ( code, err, result ){
        let msg = JSON.stringify({ status: code, err: err ? { message: err.message, stack: err.stack, errors: err.errors } : undefined, result: result });
        return msg;
    }
    
    invoke ( method, request, callback ){
        if('object' == typeof(request)){
            request = JSON.stringify(request);
        }
        let self = this;
        if(this.client){
            this.client.invoke( method, request, function( err, result ){
                if(err){
                    return callback(500,err);
                }
                let data = JSON.parse(result);
                return callback(data.status,data.err,data.result);
            });
        }else{
            callback(409,new Error(`the master not connect yet!`));
        }
        return this;
    }
    
    workerList ( callback ){
        let self = this;
        this.client.workerList( function( err, result ){
            let data = JSON.parse(result);
            return callback(data.status,data.err,data.result);
        });
    }
    
    readme ( serviceId, callback ){
        let self = this;
        this.client.readme( serviceId, function( err, result){
            let data = JSON.parse(result);
            return callback(data.status,data.err,data.result);
        });
    }
    
    registe ( port, callback ){
        let data = { ips : os.networkInterfaces() , id: this.serviceId , name: this.name, port: port };
        let self = this;
        if(this.client){
            this.client.registe( this.opts.type , this.serviceId, JSON.stringify(data), function( err, result ){
                try{
                    let data = JSON.parse(result);
                    callback( null, self.toResult( data.status, data.err, data.result ));
                }catch(e){
                    callback( null, self.toResult(500,e));
                }
                
            });
        }else{
            callback(null,self.toResult(409,new Error(`the master not connect yet!`)));
        }
        return this;
    }
}

module.exports = Client;