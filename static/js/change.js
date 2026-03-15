var change = (function() {

function default_handler(rerender, special_funcs) {
	return function(c) {
		default_handler_func(rerender, special_funcs, c);
	};
}

function change_score(cval) {
	const match_id = cval.match_id;

	// Find the match
	const m = utils.find(curt.matches, m => m._id === match_id);
	if (!m) {
		cerror.silent('Cannot find match to update score, ID: ' + JSON.stringify(match_id));
		return;
	}

	m.network_score = cval.network_score;
	m.presses = cval.presses;
	m.team1_won = cval.team1_won;

	if ((typeof cumpire_manage !== 'undefined') && crouting.get_vpath().includes('umpire_manage')) {
		if (m.presses && m.presses.length > 0) {
			cumpire_manage.dismiss_match_notifications(match_id);
		}
	}
}

function change_current_match(cval) {
	// Do not use courts_by_id since that may not be initialized in all views
	const court = utils.find(curt.courts, c => c._id === cval.court_id);
	if (court) {
		const old_match_id = court.match_id;
		court.match_id = cval.match_id;

		if (cval.match_id && cval.match_id !== old_match_id) {
			if ((typeof cumpire_manage !== 'undefined') && crouting.get_vpath().includes('umpire_manage')) {
				const m = utils.find(curt.matches, m => m._id === cval.match_id);
				if (m) {
					window.setTimeout(() => cumpire_manage.show_call_notification(m), 0);
				}
			}
		}
	} else {
		cerror.silent('Cannot find court ' + JSON.stringify(cval.court_id));
	}
}

function default_handler_func(rerender, special_funcs, c) {
	if (special_funcs && special_funcs[c.ctype]) {
		special_funcs[c.ctype](c);
		return;
	}

	switch (c.ctype) {
	case 'props': {
		const props = [
			'name', 'is_team', 'is_nation_competition', 'only_now_on_court',
			'btp_timezone', 'btp_enabled', 'btp_autofetch_enabled', 'btp_autofetch_interval',
			'btp_readonly', 'btp_sync_intermediate', 'btp_ip', 'btp_password',
			'ticker_enabled', 'ticker_url', 'ticker_password', 'logo_id',
			'umpire_tracking_enabled', 'umpire_assignment_enabled', 'service_judge_assignment_enabled', 'line_judge_assignment_enabled',
			'umpire_assignment_upcoming_penalty_1_threshold', 'umpire_assignment_upcoming_penalty_1_multiplier',
			'umpire_assignment_upcoming_penalty_2_threshold', 'umpire_assignment_upcoming_penalty_2_multiplier',
		];
		for (const k of props) {
			if (c.val[k] !== undefined) {
				curt[k] = c.val[k];
			}
		}

		uiu.qsEach('.ct_name', function(el) {
			if (el.tagName.toUpperCase() === 'INPUT') {
				el.value = curt.name;
			} else {
				uiu.text(el, curt.name);
			}
		});
		const CHECKBOXES = [
			'is_team', 'is_nation_competition', 'only_now_on_court',
			'btp_enabled', 'btp_autofetch_enabled', 'btp_readonly', 'btp_sync_intermediate',
			'ticker_enabled'];
		for (const cb_name of CHECKBOXES) {
			uiu.qsEach('input[name="' + cb_name + '"]', function(el) {
				el.checked = curt[cb_name];
			});
		}
		uiu.qsEach('input[name="btp_ip"]', function(el) {
			el.value = curt.btp_ip || '';
		});
		uiu.qsEach('input[name="btp_password"]', function(el) {
			el.value = curt.btp_password || '';
		});
		uiu.qsEach('input[name="btp_autofetch_interval"]', function(el) {
			el.value = curt.btp_autofetch_interval ? Math.round(curt.btp_autofetch_interval / 1000) : 30;
		});

		uiu.qsEach('input[name="ticker_url"]', function(el) {
			el.value = curt.ticker_url || '';
		});
		uiu.qsEach('input[name="ticker_password"]', function(el) {
			el.value = curt.ticker_password || '';
		});

		if (crouting.get_vpath() === `t/${curt.key}/edit`) {
			const update_func = uiu.qs('form.tournament_settings').update_btp_disabled;
			if (update_func) update_func();
		}

		break;}
	case 'match_add':
		{
		const new_m = c.val.match;
		curt.matches.push(new_m);
		if ((typeof cumpire_manage !== 'undefined') && crouting.get_vpath().includes('umpire_manage')) {
			const is_on_court = new_m.setup.court_id && (!curt.only_now_on_court || new_m.setup.now_on_court);
			if (is_on_court) {
				window.setTimeout(() => cumpire_manage.show_call_notification(new_m), 0);
			}
		}
		rerender();
		}
		break;
	case 'match_edit':
		{
		const changed_m = utils.find(curt.matches, m => m._id === c.val.match__id);
		if (changed_m) {
			const old_court_id = changed_m.setup.court_id;
			const old_umpire_id = changed_m.setup.umpire_id;
			const old_now_on_court = changed_m.setup.now_on_court;

			changed_m.setup = c.val.setup;
			if (c.val.line_judges !== undefined) {
				changed_m.line_judges = c.val.line_judges;
			}

			if ((typeof cumpire_manage !== 'undefined') && crouting.get_vpath().includes('umpire_manage')) {
				const is_on_court = changed_m.setup.court_id && (!curt.only_now_on_court || changed_m.setup.now_on_court);
				const was_on_court = old_court_id && (!curt.only_now_on_court || old_now_on_court);
				const umpire_changed = (changed_m.setup.umpire_id || changed_m.setup.umpire_name) !== (old_umpire_id || '');

				if ((is_on_court && !was_on_court) || (is_on_court && umpire_changed)) {
					window.setTimeout(() => cumpire_manage.show_call_notification(changed_m), 0);
				}
			}
		} else {
			cerror.silent('Cannot find edited match ' + c.val.match__id);
		}
		rerender();
		}
		break;
	case 'match_delete':
		{
		const match_id = c.val.match__id;
		const deleted = utils.remove_cb(curt.matches, m => m._id === match_id);
		if (!deleted) {
			cerror.silent('Cannot find deleted match ' + match_id);
		}
		rerender();
		}
		break;
	case 'courts_changed':
		curt.courts = c.val.all_courts;
		rerender();
		break;
	case 'umpires_changed':
		curt.umpires = c.val.all_umpires;
		uiu.qsEach('select[name="umpire_name"]', function(select) {
			cmatch.render_umpire_options(select, select.value);
		});
		if ((typeof cumpire_manage !== 'undefined') && crouting.get_vpath() === `t/${curt.key}/umpire_manage`) {
			cumpire_manage.ui_render();
		}
		break;
	case 'umpire_edit':
		{
		const u = utils.find(curt.umpires, u => u._id === c.val._id);
		if (u) {
			Object.assign(u, c.val);
		} else {
			curt.umpires.push(c.val);
		}
		if ((typeof cumpire_manage !== 'undefined') && crouting.get_vpath() === `t/${curt.key}/umpire_manage`) {
			cumpire_manage.ui_render();
		}
		}
		break;
	case 'score':
		change_score(c.val);
		// Most dialogs don't show any matches, so do not rerender
		break;
	case 'court_current_match':
		change_current_match(c.val);
		// Most dialogs don't show any matches, so do not rerender
		break;
	case 'btp_status':
		uiu.text_qs('.btp_status', 'BTP status: ' + c.val);
		break;
	case 'ticker_status':
		uiu.text_qs('.ticker_status', 'Ticker status: ' + c.val);
		break;
	default:
		cerror.silent('Unsupported change type ' + c.ctype);
	}
}

return {
	default_handler,
	change_current_match,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var cerror = require('./cerror');
	var cmatch = require('./cmatch');
	var crouting = require('./crouting');
	var cumpire_manage = require('./cumpire_manage');
	var uiu = require('../bup/js/uiu');
	var utils = require('../bup/js/utils');

    module.exports = change;
}
/*/@DEV*/
