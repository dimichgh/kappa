'use strict';

var url = require('url');
var test = require('tape');
var nock = require('nock');
var kappa = require('../');
var Hapi = require('hapi');


function mock(method, spec) {
    var uri, scope;

    function reply(uri, requestBody) {
        return requestBody;
    }

    uri = url.parse(spec.registry);
    scope = nock(uri.protocol + '//' + uri.host);

    Object.keys(spec.request).forEach(function (path) {
        var req, res, decoded;

        req = spec.request[path];
        res = req.response;

        if (req.encoding) {
            decoded = [new Buffer(res.body, req.encoding)];
        }
        path = path.replace(/(@[^\/]+)(\/)(.+)/, '$1%2F$3');
        scope = scope[method](uri.pathname + path);
        scope = scope.reply(
          res.status,
          decoded || res.body || reply,
          res.headers || undefined
        );
    });
}


test('get', function (t) {
    var spec, server;

    spec = require('./fixtures/get');
    spec.forEach(mock.bind(null, 'get'));


    t.on('end', function() {
        nock.cleanAll();
    });


    t.test('server', function (t) {
        var settings = {
            paths: spec.map(function (spec) {
                return spec.registry;
            }),
            vhost: 'npm.mydomain.com'
        };

        server = new Hapi.Server();
        server.connection();
        server.register({
            register: kappa,
            options: settings
        }, function (err) {
            t.error(err);
            t.end();
        });
    });


    t.test('private package', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'get',
            url: '/cdb'
        };

        server.inject(req, function (res) {
            var payload;

            t.equal(typeof res, 'object');
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[0].registry);
            t.strictEqual(res.statusCode, 200);

            payload = JSON.parse(res.payload);
            t.equal(typeof payload, 'object');
            t.strictEqual(payload.versions['0.0.1'].dist.tarball, 'http://npm.mydomain.com/file.tgz');

            t.end();
        });
    });


    t.test('versioned private package', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'get',
            url: '/cdb/0.0.1'
        };

        server.inject(req, function (res) {
            var payload;

            t.equal(typeof res, 'object');
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[0].registry);
            t.strictEqual(res.statusCode, 200);

            payload = JSON.parse(res.payload);
            t.equal(typeof payload, 'object');
            t.equal(payload.version, '0.0.1');
            t.equal(payload.dist.tarball, 'http://npm.mydomain.com/file.tgz');

            t.end();
        });
    });


    t.test('public package', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'get',
            url: '/core-util-is'
        };

        server.inject(req, function (res) {
            t.ok(res);
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[1].registry);
            t.strictEqual(res.statusCode, 200);
            t.end();
        });
    });


    t.test('public package (gzipped)', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'get',
            url: '/core-util-is-gzipped'
        };

        server.inject(req, function (res) {
            var payload;

            t.ok(res);
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.notOk(/gzip/.test(res.headers['content-encoding']));

            payload = JSON.parse(res.payload);
            t.strictEqual(res.headers['x-registry'], spec[1].registry);
            t.strictEqual(res.statusCode, 200);
            t.strictEqual(payload.success, true);
            t.end();
        });
    });


    t.test('versioned public package', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'get',
            url: '/core-util-is/1.0.1'
        };

        server.inject(req, function (res) {
            t.ok(res);
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[1].registry);
            t.strictEqual(res.statusCode, 200);
            t.end();
        });
    });

    t.test('unknown package', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'get',
            url: '/å'
        };

        server.inject(req, function (res) {
            t.ok(res);
            t.strictEqual(res.headers['x-registry'], spec[1].registry);
            t.strictEqual(res.statusCode, 404);
            t.end();
        });
    });


    t.test('plain', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'get',
            url: '/plain'
        };

        server.inject(req, function (res) {
            t.ok(res);
            t.ok(/^text\/plain/.test(res.headers['content-type']));
            t.strictEqual(res.statusCode, 200);
            t.end();
        });
    });


    t.test('server error', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com',
                'content-type': 'application/json'
            },
            method: 'get',
            url: '/server-error'
        };

        server.inject(req, function (res) {
            t.ok(res);
            t.strictEqual(res.statusCode, 500);
            t.end();
        });
    });


    t.test('catastrophic error', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'get',
            url: '/boom'
        };

        server.inject(req, function (res) {
            t.ok(res);
            t.strictEqual(res.statusCode, 500);
            t.end();
        });
    });

    t.test('query params', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'get',
            url: '/-/by-field?field=name'
        };

        server.inject(req, function (res) {
            t.strictEqual(res.payload, '{"pkg":{"name":"pkg"}}');
            t.strictEqual(res.statusCode, 200);
            t.ok(res.headers['x-registry']);
            t.end();
        });
    });

    t.test('public package', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'get',
            url: '/@scope/module'
        };

        server.inject(req, function (res) {
            t.ok(res);
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[1].registry);
            t.strictEqual(res.statusCode, 200);
            t.end();
        });
    });
});


test('rewrites', function (t) {
    var spec, server;

    spec = require('./fixtures/get');
    spec.forEach(mock.bind(null, 'get'));


    t.on('end', function() {
        nock.cleanAll();
    });


    t.test('server', function (t) {
        var settings = {
            paths: spec.map(function (spec) {
                return spec.registry;
            }),
            vhost: 'npm.mydomain.com',
            rewriteTarballs: false
        };

        server = new Hapi.Server();
        server.connection();
        server.register({
            register: kappa,
            options: settings
        }, function (err) {
            t.error(err);
            t.end();
        });
    });


    t.test('disabled rewrites', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'get',
            url: '/cdb'
        };

        server.inject(req, function (res) {
            var payload;

            t.equal(typeof res, 'object');
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[0].registry);
            t.strictEqual(res.statusCode, 200);

            payload = JSON.parse(res.payload);
            t.equal(typeof payload, 'object');
            t.strictEqual(payload.versions['0.0.1'].dist.tarball, 'http://localhost:5984/file.tgz');

            t.end();
        });
    });
});


test('head', function (t) {
    var spec, server;

    spec = require('./fixtures/head');
    spec.forEach(mock.bind(null, 'head'));


    t.on('end', function() {
        nock.cleanAll();
    });


    t.test('server', function (t) {
        var settings = {
            paths: spec.map(function (spec) {
                return spec.registry;
            }),
            vhost: 'npm.mydomain.com'
        };


        server = new Hapi.Server();
        server.connection();
        server.register({
            register: kappa,
            options: settings
        }, function (err) {
            t.error(err);
            t.end();
        });
    });


    t.test('private package', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'head',
            url: '/cdb'
        };

        server.inject(req, function (res) {
            var payload;

            t.equal(res.result, null);
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[0].registry);
            t.strictEqual(res.statusCode, 200);
            t.end();
        });
    });


    t.test('versioned private package', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'head',
            url: '/cdb/0.0.1'
        };

        server.inject(req, function (res) {
            var payload;

            t.equal(res.result, null);
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[0].registry);
            t.strictEqual(res.statusCode, 200);
            t.end();
        });
    });


    t.test('public package', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'head',
            url: '/core-util-is'
        };

        server.inject(req, function (res) {
            t.ok(res);
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[1].registry);
            t.strictEqual(res.statusCode, 200);
            t.end();
        });
    });


    t.test('versioned public package', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'head',
            url: '/core-util-is/1.0.1'
        };

        server.inject(req, function (res) {
            t.ok(res);
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[1].registry);
            t.strictEqual(res.statusCode, 200);
            t.end();
        });
    });


    t.test('unknown package', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'head',
            url: '/å'
        };

        server.inject(req, function (res) {
            t.ok(res);
            t.strictEqual(res.headers['x-registry'], spec[1].registry);
            t.strictEqual(res.statusCode, 404);
            t.end();
        });
    });


    t.test('public scoped package', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'head',
            url: '/@scope/module'
        };

        server.inject(req, function (res) {
            t.ok(res);
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[1].registry);
            t.strictEqual(res.statusCode, 200);
            t.end();
        });
    });
});


test('post', function (t) {
    var spec, server;

    spec = require('./fixtures/post');
    spec.forEach(mock.bind(null, 'post'));


    t.on('end', function() {
        nock.cleanAll();
    });


    t.test('server', function (t) {
        var settings = {
            paths: spec.map(function (spec) {
                return spec.registry;
            }),
            vhost: 'npm.mydomain.com'
        };

        server = new Hapi.Server();
        server.connection();
        server.register({
            register: kappa,
            options: settings
        }, function (err) {
            t.error(err);
            t.end();
        });
    });


    t.test('private package', function (t) {
        var expected, req;

        expected = { foo: 'bar' };
        req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'post',
            url: '/cdb',
            payload: JSON.stringify(expected)
        };

        server.inject(req, function (res) {
            var payload;

            t.equal(typeof res, 'object');
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[0].registry);
            t.strictEqual(res.statusCode, 200);

            payload = JSON.parse(res.payload);
            t.equal(typeof payload, 'object');
            t.deepEqual(expected, payload);

            t.end();
        });
    });
});


test('put', function (t) {
    var spec, server;

    spec = require('./fixtures/put');
    spec.forEach(mock.bind(null, 'put'));


    t.on('end', function() {
        nock.cleanAll();
    });


    t.test('server', function (t) {
        var settings = {
            paths: spec.map(function (spec) {
                return spec.registry;
            }),
            vhost: 'npm.mydomain.com'
        };

        server = new Hapi.Server();
        server.connection();
        server.register({
            register: kappa,
            options: settings
        }, function (err) {
            t.error(err);
            t.end();
        });
    });


    t.test('private package', function (t) {
        var expected, req;

        expected = { foo: 'bar' };
        req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'put',
            url: '/cdb',
            payload: JSON.stringify(expected)
        };

        server.inject(req, function (res) {
            var payload;

            t.equal(typeof res, 'object');
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[0].registry);
            t.strictEqual(res.statusCode, 200);

            payload = JSON.parse(res.payload);
            t.equal(typeof payload, 'object');
            t.deepEqual(expected, payload);

            t.end();
        });
    });
});


test('delete', function (t) {
    var spec, server;

    spec = require('./fixtures/delete');
    spec.forEach(mock.bind(null, 'delete'));


    t.on('end', function() {
        nock.cleanAll();
    });


    t.test('server', function (t) {
        var settings = {
            paths: spec.map(function (spec) {
                return spec.registry;
            }),
            vhost: 'npm.mydomain.com'
        };

        server = new Hapi.Server();
        server.connection();
        server.register({
            register: kappa,
            options: settings
        }, function (err) {
            t.error(err);
            t.end();
        });
    });


    t.test('private package', function (t) {
        var expected, req;

        expected = { ok: true };
        req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'delete',
            url: '/cdb',
            payload: JSON.stringify(expected)
        };

        server.inject(req, function (res) {
            var payload;

            t.equal(typeof res, 'object');
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[0].registry);
            t.strictEqual(res.statusCode, 200);

            payload = JSON.parse(res.payload);
            t.equal(typeof payload, 'object');
            t.deepEqual(expected, payload);

            t.end();
        });
    });


    t.test('private package', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'delete',
            url: '/core-util-is'
        };

        server.inject(req, function (res) {
            t.equal(typeof res, 'object');
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.headers['x-registry'], spec[0].registry);
            t.strictEqual(res.statusCode, 404);
            t.end();
        });
    });
});


test('futon', function (t) {
    var spec, server;

    spec = require('./fixtures/futon');
    spec.forEach(mock.bind(null, 'get'));


    t.on('end', function() {
        nock.cleanAll();
    });


    t.test('server', function (t) {
        var settings = {
            paths: spec.map(function (spec) {
                return spec.registry;
            }),
            vhost: 'npm.mydomain.com'
        };

        server = new Hapi.Server();
        server.connection();
        server.register({
            register: kappa,
            options: settings
        }, function (err) {
            t.error(err);
            t.end();
        });
    });

    t.test('blocked json', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com'
            },
            method: 'get',
            url: '/_utils/index.html'
        };

        server.inject(req, function (res) {
            t.equal(typeof res, 'object');
            t.ok(/^text\/html/.test(res.headers['content-type']));
            t.strictEqual(res.statusCode, 403);
            t.end();
        });
    });

    t.test('blocked html', function (t) {
        var req = {
            headers: {
                host: 'npm.mydomain.com',
                'content-type': 'application/json'
            },
            method: 'get',
            url: '/_utils/index.html'
        };

        server.inject(req, function (res) {
            t.equal(typeof res, 'object');
            t.ok(/^application\/json/.test(res.headers['content-type']));
            t.strictEqual(res.statusCode, 403);
            t.end();
        });
    });

});
