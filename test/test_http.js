'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');

const express = require('express');
const nedb = require('nedb');

const bts = require('../bts/bts');
const database = require('../bts/database');

describe('HTTP tests', function() {
	let app;
	let db;
	let server;

	beforeEach(function(done) {
		db = {};
		db.tournaments = new nedb({inMemoryOnly: true});
		db.umpires = new nedb({inMemoryOnly: true});
		db.courts = new nedb({inMemoryOnly: true});
		db.matches = new nedb({inMemoryOnly: true});

		const config = {
			port: 0,
			bup_location: path.join(__dirname, '..', 'static', 'bup'),
			bup_index: 'index.html',
		};

		app = bts.create_app(config, db);
		server = http.createServer(app).listen(0, 'localhost', done);
	});

	afterEach(function(done) {
		server.close(done);
	});

	it('should serve umpire selection page', function(done) {
		db.tournaments.insert({_id: 'test-tournament', key: 'test-tournament'}, (err) => {
			assert.ifError(err);
			db.umpires.insert({_id: 'umpire1', name: 'Umpire 1', tournament_key: 'test-tournament'}, (err) => {
				assert.ifError(err);

				http.get({
					hostname: 'localhost',
					port: server.address().port,
					path: '/u_select/test-tournament',
				}, (res) => {
					assert.strictEqual(res.statusCode, 200);
					let body = '';
					res.on('data', (chunk) => {
						body += chunk;
					});
					res.on('end', () => {
						assert(body.includes('<h1>Select Umpire</h1>'));
						assert(body.includes('<a class="button" href="/set_umpire/test-tournament/umpire1">Umpire 1</a>'));
						done();
					});
				});
			});
		});
	});

	it('should set umpire cookie and redirect', function(done) {
		db.tournaments.insert({_id: 'test-tournament', key: 'test-tournament'}, (err) => {
			assert.ifError(err);

			http.get({
				hostname: 'localhost',
				port: server.address().port,
				path: '/set_umpire/test-tournament/umpire1',
			}, (res) => {
				assert.strictEqual(res.statusCode, 302);
				const settings = {
					court_selection_type: 'umpire',
					umpire_id: 'umpire1',
				};
				const expected_cookie = `bup_settings=${encodeURIComponent(JSON.stringify(settings))}; Path=/bup/`;
				assert.strictEqual(res.headers['set-cookie'][0], expected_cookie);
				assert.strictEqual(res.headers.location, '/bup/#btsh_e=test-tournament');
				done();
			});
		});
	});
});
