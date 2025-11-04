var Endpoint = /** @class */ (function () {
    function Endpoint(address, port) {
        this.address = address;
        this.port = port;
    }
    Endpoint.prototype.toString = function () {
        return "".concat(this.address, ":").concat(this.port);
    };
    Endpoint.prototype.onMessage = function (_command, _callback) { };
    Endpoint.prototype.onDisconnection = function () { };
    return Endpoint;
}());
export { Endpoint };
