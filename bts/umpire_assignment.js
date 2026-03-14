'use strict';

const async = require('async');
const btp_manager = require('./btp_manager');
const utils = require('./utils');

function get_today_6am() {
	const now = new Date();
	const today_6am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0, 0);
	if (now.getHours() < 6) {
		today_6am.setDate(today_6am.getDate() - 1);
	}
	return today_6am.getTime();
}

function _calculate_stats(umpires, matches) {
	const today_6am = get_today_6am();
	const umpires_by_id = new Map();
	const umpires_by_name = new Map();

	for (const u of umpires) {
		u.total_matches_all = 0;
		u.total_matches_today = 0;
		u.last_match_end_ts = 0;
		u.last_role = null;
		u.on_court_match_id = null;
		u.on_court_court_id = null;
		u.on_court_role = null;
		u.on_court_match_score = null;
		u.on_court_match_start_ts = null;
		umpires_by_id.set(u._id, u);
		umpires_by_name.set(u.name, u);
	}

	for (const m of matches) {
		const u_id = m.setup.umpire_id;
		const u_name = m.setup.umpire_name;
		const sj_id = m.setup.service_judge_id;
		const sj_name = m.setup.service_judge_name;

		const process_umpire = (id, name, role) => {
			const u = umpires_by_id.get(id) || umpires_by_name.get(name);
			if (!u) return;

			if (m.end_ts) {
				u.total_matches_all++;
				if (m.end_ts >= today_6am) {
					u.total_matches_today++;
				}
				if (m.end_ts > u.last_match_end_ts) {
					u.last_match_end_ts = m.end_ts;
					u.last_role = role;
				}
			} else if (m.setup.court_id && m.setup.now_on_court) {
				u.on_court_match_id = m._id;
				u.on_court_court_id = m.setup.court_id;
				u.on_court_role = role;
				u.on_court_match_score = m.network_score;
				if (m.presses && m.presses.length > 0) {
					u.on_court_match_start_ts = m.presses[0].timestamp;
				}
			}
		};

		process_umpire(u_id, u_name, 'umpire');
		process_umpire(sj_id, sj_name, 'service_judge');
	}
}


function get_priority(u, now) {
	const weight = (u.weight !== undefined) ? u.weight : 1.0;
	const multiplier = (u.upcoming_multiplier !== undefined) ? u.upcoming_multiplier : 1.0;
	let time_diff;
	const today_6am = get_today_6am();
	if (!u.last_match_end_ts || u.last_match_end_ts < today_6am) {
		time_diff = (now - today_6am) + 24 * 60 * 60 * 1000;
	} else {
		time_diff = now - u.last_match_end_ts;
	}
	return time_diff * weight * multiplier;
}

function sort_matches(matches) {
	matches.sort((a, b) => {
		if (a.match_order !== b.match_order) {
			return (a.match_order || 0) - (b.match_order || 0);
		}
		return (a.setup.match_num || 0) - (b.setup.match_num || 0);
	});
}

function _calculate_penalties(umpires, matches, tournament, courts) {
	const n = courts.length;
	if (n === 0) return;

	const t1 = (tournament.umpire_assignment_upcoming_penalty_1_threshold !== undefined) ? tournament.umpire_assignment_upcoming_penalty_1_threshold : 1.0;
	const m1 = (tournament.umpire_assignment_upcoming_penalty_1_multiplier !== undefined) ? tournament.umpire_assignment_upcoming_penalty_1_multiplier : 0.0;
	const t2 = (tournament.umpire_assignment_upcoming_penalty_2_threshold !== undefined) ? tournament.umpire_assignment_upcoming_penalty_2_threshold : 1.5;
	const m2 = (tournament.umpire_assignment_upcoming_penalty_2_multiplier !== undefined) ? tournament.umpire_assignment_upcoming_penalty_2_multiplier : 0.5;

	const upcoming_matches = matches.filter(m => !m.end_ts && !m.setup.now_on_court);
	sort_matches(upcoming_matches);

	const umpires_by_id = new Map();
	const umpires_by_name = new Map();
	for (const u of umpires) {
		u.upcoming_multiplier = 1.0;
		umpires_by_id.set(u._id, u);
		umpires_by_name.set(u.name, u);
	}

	upcoming_matches.forEach((m, idx) => {
		const pos = idx + 1;
		let multiplier = 1.0;
		if (pos <= t1 * n) {
			multiplier = m1;
		} else if (pos <= t2 * n) {
			multiplier = m2;
		} else {
			return; // No penalty beyond this
		}

		const process_u = (id, name) => {
			const u = umpires_by_id.get(id) || umpires_by_name.get(name);
			if (u && u.upcoming_multiplier > multiplier) {
				u.upcoming_multiplier = multiplier;
			}
		};
		process_u(m.setup.umpire_id, m.setup.umpire_name);
		process_u(m.setup.service_judge_id, m.setup.service_judge_name);
	});
}

function reassign(app, tournament_key, callback) {
	const db = app.db;
	db.tournaments.findOne({key: tournament_key}, (err, tournament) => {
		if (err) return callback && callback(err);
		if (!tournament || !tournament.umpire_tracking_enabled) return callback && callback();

		async.parallel({
			umpires: cb => db.umpires.find({tournament_key}, cb),
			matches: cb => db.matches.find({tournament_key}, cb),
			courts: cb => db.courts.find({tournament_key}, cb),
		}, (err, results) => {
			if (err) return callback && callback(err);

			const {umpires, matches, courts} = results;
			const now = Date.now();

			_calculate_stats(umpires, matches);
			_calculate_penalties(umpires, matches, tournament, courts);

			const unassigned_umpire_matches = [];
			const unassigned_sj_matches = [];
			for (const m of matches) {
				const u_id = m.setup.umpire_id;
				const u_name = m.setup.umpire_name;
				const sj_id = m.setup.service_judge_id;
				const sj_name = m.setup.service_judge_name;

				if (!m.end_ts && m.setup.court_id && m.setup.now_on_court) {
					if (!u_id && !u_name) {
						unassigned_umpire_matches.push(m);
					} else if (tournament.service_judge_assignment_enabled && !sj_id && !sj_name) {
						// Only assign SJ if umpire is already assigned (either by us or manually)
						unassigned_sj_matches.push(m);
					}
				}
			}

			sort_matches(unassigned_umpire_matches);
			sort_matches(unassigned_sj_matches);

			if (!tournament.umpire_assignment_enabled || (unassigned_umpire_matches.length === 0 && unassigned_sj_matches.length === 0)) {
				return callback && callback();
			}

			// Filter available umpires
			let available_umpires = umpires.filter(u => {
				if (u.on_court_match_id) return false;
				if (u.status === 'paused' || u.status === 'away') return false;
				return true;
			});

			const assignments = [];
			for (const m of unassigned_umpire_matches) {
				if (available_umpires.length === 0) break;

				// Prefer umpires who didn't just serve as umpire
				available_umpires.sort((a, b) => {
					if (tournament.service_judge_assignment_enabled) {
						if (a.last_role !== b.last_role) {
							if (a.last_role === 'service_judge') return -1;
							if (b.last_role === 'service_judge') return 1;
						}
					}
					return get_priority(b, now) - get_priority(a, now);
				});

				const u = available_umpires.shift();
				assignments.push({
					match: m,
					umpire: u,
					role: 'umpire',
				});
			}

			if (tournament.service_judge_assignment_enabled) {
				for (const m of unassigned_sj_matches) {
					if (available_umpires.length === 0) break;

					// Prefer umpires who just served as umpire (so they alternate to SJ)
					available_umpires.sort((a, b) => {
						if (a.last_role !== b.last_role) {
							if (a.last_role === 'umpire') return -1;
							if (b.last_role === 'umpire') return 1;
						}
						return get_priority(b, now) - get_priority(a, now);
					});

					const u = available_umpires.shift();
					assignments.push({
						match: m,
						umpire: u,
						role: 'service_judge',
					});
				}
			}

			async.eachSeries(assignments, (asgn, cb) => {
				const {match, umpire, role} = asgn;
				const setup = JSON.parse(JSON.stringify(match.setup));
				if (role === 'umpire') {
					setup.umpire_name = umpire.name;
					setup.umpire_id = umpire._id;
				} else {
					setup.service_judge_name = umpire.name;
					setup.service_judge_id = umpire._id;
				}

				db.matches.update({_id: match._id}, {$set: {setup, btp_needsync: true}}, {returnUpdatedDocs: true}, (err, num, updated_m) => {
					if (err) return cb(err);
					const admin = require('./admin');
					admin.notify_change(app, tournament_key, 'match_edit', {match__id: match._id, setup});
					btp_manager.update_score(app, updated_m);
					cb();
				});
			}, callback);
		});
	});
}

function get_umpires_with_stats(app, tournament_key, callback) {
	const db = app.db;
	const now = Date.now();

	async.parallel({
		umpires: cb => db.umpires.find({tournament_key}, cb),
		matches: cb => db.matches.find({tournament_key}, cb),
		tournament: cb => db.tournaments.findOne({key: tournament_key}, cb),
		courts: cb => db.courts.find({tournament_key}, cb),
	}, (err, results) => {
		if (err) return callback(err);

		const {umpires, matches, tournament, courts} = results;
		_calculate_stats(umpires, matches);
		_calculate_penalties(umpires, matches, tournament, courts);

		for (const u of umpires) {
			if (u.on_court_match_id) {
				u.calculated_status = 'oncourt';
			} else if (u.status === 'paused' || u.status === 'away') {
				u.calculated_status = u.status;
			} else {
				u.calculated_status = 'ready';
			}
			u.priority_score = get_priority(u, now);
		}

		callback(null, umpires);
	});
}

module.exports = {
	get_umpires_with_stats,
	reassign,
};
