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
						assert(body.includes('<a class="button" href="/bup/#btsh_e=test-tournament&umpire_id=umpire1&umpire_name=Umpire%201&court_selection_type=umpire" data-umpire-id="umpire1" data-umpire-name="Umpire 1" onclick="return on_umpire_click(this)">Umpire 1</a>'));
						done();
					});
				});
			});
		});
	});
});
