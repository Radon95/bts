'use strict';

var cumpire_manage = (function() {

let last_umpires_with_stats = [];

let last_render_request_ts = 0;
let render_timeout = null;

let tts_queue = [];
let tts_speaking = false;
let tts_match_timeouts = {};

function process_tts_queue() {
	if (tts_speaking || tts_queue.length === 0) return;

	const { text, lang, match_id } = tts_queue.shift();
	if (!window.speechSynthesis) return;

	tts_speaking = true;
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.lang = lang;
	utterance.rate = 0.9;

	utterance.onend = () => {
		tts_speaking = false;
		setTimeout(process_tts_queue, 500); // Small pause between calls
	};
	utterance.onerror = (e) => {
		console.error('TTS error', e);
		tts_speaking = false;
		setTimeout(process_tts_queue, 500);
	};

	window.speechSynthesis.speak(utterance);
}

function queue_tts(text, lang, match_id) {
	if (tts_match_timeouts[match_id]) {
		clearTimeout(tts_match_timeouts[match_id]);
	}

	tts_match_timeouts[match_id] = setTimeout(() => {
		delete tts_match_timeouts[match_id];
		// Remove existing pending announcements for this match
		tts_queue = tts_queue.filter(item => item.match_id !== match_id);
		tts_queue.push({ text, lang, match_id });
		process_tts_queue();
	}, 1000); // Wait 1 second to see if more info (like an umpire) is assigned
}

function ui_show() {
	crouting.set('t/:key/umpire_manage', {key: curt.key});
	toprow.set([{
		label: ci18n('Tournaments'),
		func: ctournament.ui_list,
	}, {
		label: curt.name || curt.key,
		func: ctournament.ui_show,
		'class': 'ct_name',
	}, {
		label: ci18n('umpire_manage:title'),
	}]);

	const main = uiu.qs('.main');
	uiu.empty(main);

	uiu.el(main, 'h1', {}, ci18n('umpire_manage:title'));

	const top_controls = uiu.el(main, 'div', 'umpire_manage_controls');

	const options_btn = uiu.el(top_controls, 'button', {}, ci18n('umpire_manage:options'));
	options_btn.addEventListener('click', ui_options);

	const recalc_btn = uiu.el(top_controls, 'button', {}, ci18n('umpire_manage:recalculate'));
	recalc_btn.addEventListener('click', () => {
		send({
			type: 'umpire_recalculate',
			tournament_key: curt.key,
		}, (err) => {
			if (err) return cerror.net(err);
			ui_render();
		});
	});

	uiu.el(main, 'div', 'umpire_manage_container');
	ui_render(true);
}

function ui_options() {
	const body = uiu.qs('body');
	const dlg_bg = uiu.el(body, 'div', 'dialog_bg');
	const dlg = uiu.el(dlg_bg, 'div', 'dialog');

	function close() {
		cbts_utils.esc_stack_pop();
		uiu.remove(dlg_bg);
	}
	cbts_utils.esc_stack_push(close);

	uiu.el(dlg, 'h2', {}, ci18n('umpire_manage:options'));

	const tracking_label = uiu.el(dlg, 'label', {style: 'display: block; margin-bottom: 10px; text-align: left;'});
	const tracking_cb = uiu.el(tracking_label, 'input', {
		type: 'checkbox',
	});
	tracking_cb.checked = !!curt.umpire_tracking_enabled;
	uiu.el(tracking_label, 'span', {}, ' ' + ci18n('umpire_manage:tracking_enabled'));
	uiu.el(tracking_label, 'span', {style: 'font-size: 0.8em; margin-left: 0.5em;'}, ci18n('umpire_manage:tracking_enabled:note'));

	const assignment_label = uiu.el(dlg, 'label', {style: 'display: block; margin-bottom: 10px; text-align: left; margin-left: 20px;'});
	const assignment_cb = uiu.el(assignment_label, 'input', {
		type: 'checkbox',
	});
	if (curt.umpire_assignment_enabled) assignment_cb.checked = true;
	uiu.el(assignment_label, 'span', {}, ' ' + ci18n('umpire_manage:assignment_enabled'));

	const sj_label = uiu.el(dlg, 'label', {style: 'display: block; margin-bottom: 10px; text-align: left; margin-left: 40px;'});
	const sj_cb = uiu.el(sj_label, 'input', {
		type: 'checkbox',
	});
	if (curt.service_judge_assignment_enabled) sj_cb.checked = true;
	uiu.el(sj_label, 'span', {}, ' ' + ci18n('umpire_manage:sj_assignment_enabled') + ' (' + ci18n('experimental') + ')');

	const lj_label = uiu.el(dlg, 'label', {style: 'display: block; margin-bottom: 10px; text-align: left; margin-left: 20px;'});
	const lj_cb = uiu.el(lj_label, 'input', {
		type: 'checkbox',
	});
	if (curt.line_judge_assignment_enabled) lj_cb.checked = true;
	uiu.el(lj_label, 'span', {}, ' ' + ci18n('umpire_manage:lj_assignment_enabled'));

	const directions = ['bottom', 'top', 'left', 'right'];

	const pause_dir_label = uiu.el(dlg, 'label', {style: 'display: block; margin-bottom: 10px; text-align: left;'});
	uiu.el(pause_dir_label, 'span', {}, ci18n('umpire_manage:pause_slide_direction') + ': ');
	const pause_dir_select = uiu.el(pause_dir_label, 'select');
	directions.forEach(dir => {
		const opt = uiu.el(pause_dir_select, 'option', {
			value: dir,
		}, ci18n(`umpire_manage:direction:${dir}`));
		if ((curt.umpire_manage_pause_direction || 'bottom') === dir) {
			opt.selected = true;
		}
	});

	const away_dir_label = uiu.el(dlg, 'label', {style: 'display: block; margin-bottom: 10px; text-align: left;'});
	uiu.el(away_dir_label, 'span', {}, ci18n('umpire_manage:away_slide_direction') + ': ');
	const away_dir_select = uiu.el(away_dir_label, 'select');
	directions.forEach(dir => {
		const opt = uiu.el(away_dir_select, 'option', {
			value: dir,
		}, ci18n(`umpire_manage:direction:${dir}`));
		if ((curt.umpire_manage_away_direction || 'bottom') === dir) {
			opt.selected = true;
		}
	});

	function create_penalty_controls(container, index, def_threshold, def_multiplier) {
		const row = uiu.el(container, 'div', {style: 'margin-bottom: 10px;'});
		uiu.el(row, 'span', {style: 'display: inline-block; min-width: 100px;'}, ci18n(`umpire_manage:penalty_${index}`));

		const n = (curt.courts ? curt.courts.length : 0);

		const threshold_val = curt[`umpire_assignment_upcoming_penalty_${index}_threshold`] !== undefined ? curt[`umpire_assignment_upcoming_penalty_${index}_threshold`] : def_threshold;
		const multiplier_val = curt[`umpire_assignment_upcoming_penalty_${index}_multiplier`] !== undefined ? curt[`umpire_assignment_upcoming_penalty_${index}_multiplier`] : def_multiplier;

		uiu.el(row, 'span', {}, ci18n('umpire_manage:threshold') + ': ');
		const percent_input = uiu.el(row, 'input', {
			type: 'number',
			style: 'width: 4em;',
			value: Math.round(threshold_val * 100),
		});
		uiu.el(row, 'span', {}, '% (' + ci18n('umpire_manage:n_courts') + ') = ');
		const absolute_input = uiu.el(row, 'input', {
			type: 'number',
			style: 'width: 4em;',
			value: Math.round(threshold_val * n),
		});
		uiu.el(row, 'span', {}, ' ' + ci18n('umpire_manage:matches'));

		uiu.el(row, 'span', {style: 'margin-left: 20px;'}, ci18n('umpire_manage:multiplier') + ': ');
		const mult_input = uiu.el(row, 'input', {
			type: 'number',
			style: 'width: 4em;',
			step: '0.1',
			value: multiplier_val.toFixed(1),
		});
		uiu.el(row, 'span', {}, ' / ');
		const mult_percent_input = uiu.el(row, 'input', {
			type: 'number',
			style: 'width: 4em;',
			value: Math.round(multiplier_val * 100),
		});
		uiu.el(row, 'span', {}, '%');

		percent_input.addEventListener('input', () => {
			const val = parseFloat(percent_input.value) / 100;
			absolute_input.value = Math.round(val * n);
		});
		absolute_input.addEventListener('input', () => {
			if (n > 0) {
				percent_input.value = Math.round(parseFloat(absolute_input.value) / n * 100);
			}
		});
		mult_input.addEventListener('input', () => {
			mult_percent_input.value = Math.round(parseFloat(mult_input.value) * 100);
		});
		mult_percent_input.addEventListener('input', () => {
			mult_input.value = (parseFloat(mult_percent_input.value) / 100).toFixed(1);
		});

		return {
			get_threshold: () => parseFloat(percent_input.value) / 100,
			get_multiplier: () => parseFloat(mult_input.value),
		};
	}

	const penalty_container = uiu.el(dlg, 'div', {style: 'margin-top: 20px; text-align: left;'});
	uiu.el(penalty_container, 'h3', {}, ci18n('umpire_manage:penalties_title'));
	const p1_ctrls = create_penalty_controls(penalty_container, 1, 1.0, 0.0);
	const p2_ctrls = create_penalty_controls(penalty_container, 2, 1.5, 0.5);

	const call_container = uiu.el(dlg, 'div', {style: 'margin-top: 20px; text-align: left;'});
	uiu.el(call_container, 'h3', {}, ci18n('umpire_manage:call_match:enabled'));

	const call_enabled_label = uiu.el(call_container, 'label', {style: 'display: block; margin-bottom: 5px;'});
	const call_enabled_cb = uiu.el(call_enabled_label, 'input', {type: 'checkbox'});
	call_enabled_cb.checked = !!curt.umpire_manage_call_match_enabled;
	uiu.el(call_enabled_label, 'span', {}, ' ' + ci18n('umpire_manage:call_match:enabled'));

	const call_sj_label = uiu.el(call_container, 'label', {style: 'display: block; margin-bottom: 5px; margin-left: 20px;'});
	const call_sj_cb = uiu.el(call_sj_label, 'input', {type: 'checkbox'});
	call_sj_cb.checked = !!curt.umpire_manage_call_match_optional_sj;
	uiu.el(call_sj_label, 'span', {}, ' ' + ci18n('umpire_manage:call_match:optional_sj'));

	const call_lj_label = uiu.el(call_container, 'label', {style: 'display: block; margin-bottom: 5px; margin-left: 20px;'});
	const call_lj_cb = uiu.el(call_lj_label, 'input', {type: 'checkbox'});
	call_lj_cb.checked = !!curt.umpire_manage_call_match_optional_lj;
	uiu.el(call_lj_label, 'span', {}, ' ' + ci18n('umpire_manage:call_match:optional_lj'));

	const corner_label = uiu.el(call_container, 'label', {style: 'display: block; margin-bottom: 5px; margin-left: 20px;'});
	uiu.el(corner_label, 'span', {}, ci18n('umpire_manage:call_match:corner') + ': ');
	const corner_select = uiu.el(corner_label, 'select');
	['bottom-right', 'bottom-left', 'top-right', 'top-left'].forEach(corner => {
		const opt = uiu.el(corner_select, 'option', {value: corner}, ci18n(`umpire_manage:call_match:corner:${corner}`));
		if ((curt.umpire_manage_call_match_corner || 'bottom-right') === corner) opt.selected = true;
	});

	const lifetime_label = uiu.el(call_container, 'label', {style: 'display: block; margin-bottom: 5px; margin-left: 20px;'});
	uiu.el(lifetime_label, 'span', {}, ci18n('umpire_manage:call_match:lifetime') + ': ');
	const lifetime_input = uiu.el(lifetime_label, 'input', {
		type: 'number',
		style: 'width: 4em;',
		value: curt.umpire_manage_call_match_lifetime !== undefined ? curt.umpire_manage_call_match_lifetime : 0,
	});

	const exact_words_label = uiu.el(call_container, 'label', {style: 'display: block; margin-bottom: 5px; margin-left: 20px;'});
	const exact_words_cb = uiu.el(exact_words_label, 'input', {type: 'checkbox'});
	exact_words_cb.checked = !!curt.umpire_manage_call_match_exact_words;
	uiu.el(exact_words_label, 'span', {}, ' ' + ci18n('umpire_manage:call_match:exact_words'));

	const read_call_label = uiu.el(call_container, 'label', {style: 'display: block; margin-bottom: 5px; margin-left: 40px;'});
	const read_call_cb = uiu.el(read_call_label, 'input', {type: 'checkbox'});
	read_call_cb.checked = localStorage.getItem('umpire_manage_call_match_read_call') === 'true';
	uiu.el(read_call_label, 'span', {}, ' ' + ci18n('umpire_manage:call_match:read_call') + ' (' + ci18n('experimental') + ')');

	const language_label = uiu.el(call_container, 'label', {style: 'display: block; margin-bottom: 5px; margin-left: 20px;'});
	uiu.el(language_label, 'span', {}, ci18n('umpire_manage:call_match:language') + ': ');
	const language_select = uiu.el(language_label, 'select');
	['en', 'de'].forEach(lang => {
		const opt = uiu.el(language_select, 'option', {value: lang}, ci18n(`umpire_manage:call_match:language:${lang}`));
		if ((curt.umpire_manage_call_match_language || 'en') === lang) opt.selected = true;
	});

	function update_disabled() {
		if (!tracking_cb.checked) {
			assignment_cb.disabled = true;
			sj_cb.disabled = true;
			lj_cb.disabled = true;
		} else {
			assignment_cb.disabled = false;
			sj_cb.disabled = !assignment_cb.checked;
			lj_cb.disabled = false;
		}

		const call_enabled = call_enabled_cb.checked;
		call_sj_cb.disabled = !call_enabled;
		call_lj_cb.disabled = !call_enabled;
		corner_select.disabled = !call_enabled;
		lifetime_input.disabled = !call_enabled;
		exact_words_cb.disabled = !call_enabled;
		read_call_cb.disabled = !call_enabled || !exact_words_cb.checked;
		language_select.disabled = !call_enabled;
	}
	update_disabled();

	tracking_cb.addEventListener('change', update_disabled);
	assignment_cb.addEventListener('change', update_disabled);
	call_enabled_cb.addEventListener('change', update_disabled);
	exact_words_cb.addEventListener('change', update_disabled);

	const btn_row = uiu.el(dlg, 'div', {style: 'margin-top: 20px; text-align: right;'});
	const cancel_btn = uiu.el(btn_row, 'button', {style: 'margin-right: 10px;'}, ci18n('Cancel'));
	cancel_btn.addEventListener('click', close);

	const ok_btn = uiu.el(btn_row, 'button', {}, ci18n('Change'));
	ok_btn.addEventListener('click', () => {
		localStorage.setItem('umpire_manage_call_match_read_call', read_call_cb.checked);

		const props = {
			umpire_tracking_enabled: tracking_cb.checked,
			umpire_assignment_enabled: (tracking_cb.checked && assignment_cb.checked),
			service_judge_assignment_enabled: (tracking_cb.checked && assignment_cb.checked && sj_cb.checked),
			line_judge_assignment_enabled: (tracking_cb.checked && lj_cb.checked),
			umpire_manage_pause_direction: pause_dir_select.value,
			umpire_manage_away_direction: away_dir_select.value,
			umpire_assignment_upcoming_penalty_1_threshold: p1_ctrls.get_threshold(),
			umpire_assignment_upcoming_penalty_1_multiplier: p1_ctrls.get_multiplier(),
			umpire_assignment_upcoming_penalty_2_threshold: p2_ctrls.get_threshold(),
			umpire_assignment_upcoming_penalty_2_multiplier: p2_ctrls.get_multiplier(),
			umpire_manage_call_match_enabled: call_enabled_cb.checked,
			umpire_manage_call_match_optional_sj: call_sj_cb.checked,
			umpire_manage_call_match_optional_lj: call_lj_cb.checked,
			umpire_manage_call_match_corner: corner_select.value,
			umpire_manage_call_match_lifetime: parseInt(lifetime_input.value, 10),
			umpire_manage_call_match_exact_words: exact_words_cb.checked,
			umpire_manage_call_match_language: language_select.value,
		};

		send({
			type: 'tournament_edit_props',
			key: curt.key,
			props: props,
		}, (err) => {
			if (err) return cerror.net(err);
			Object.assign(curt, props);
			close();
			ui_render();
		});
	});
}

function ui_umpire_details(u) {
	const body = uiu.qs('body');
	const dlg_bg = uiu.el(body, 'div', 'dialog_bg');
	const dlg = uiu.el(dlg_bg, 'div', 'dialog');

	function close() {
		cbts_utils.esc_stack_pop();
		uiu.remove(dlg_bg);
	}
	cbts_utils.esc_stack_push(close);

	uiu.el(dlg, 'h2', {}, u.name);

	uiu.el(dlg, 'div', 'umpire_details_stat', ci18n('umpire_manage:info:total_matches', {total: u.total_matches_all}));
	uiu.el(dlg, 'div', 'umpire_details_stat', ci18n('umpire_manage:info:today_matches', {today: u.total_matches_today}));
	uiu.el(dlg, 'div', 'umpire_details_stat', ci18n('umpire_manage:info:last_match', {time: (u.last_match_end_ts ? utils.time_str(u.last_match_end_ts) : 'N/A')}));
	if (u.priority_score !== undefined) {
		uiu.el(dlg, 'div', 'umpire_details_stat', ci18n('umpire_manage:info:priority', {score: Math.round(u.priority_score / 60000)}));
	}

	const weight_controls = uiu.el(dlg, 'div', 'umpire_details_weight_controls');
	uiu.el(weight_controls, 'span', {}, 'Weight: ');
	const weight_input = uiu.el(weight_controls, 'input', {
		type: 'number',
		step: '0.1',
		value: (u.weight !== undefined ? u.weight.toFixed(1) : '1.0'),
		style: 'width: 5em',
	});

	function save_weight(new_weight) {
		new_weight = Math.max(0.1, Math.round(new_weight * 10) / 10);
		send({
			type: 'umpire_edit_props',
			tournament_key: curt.key,
			id: u._id,
			props: { weight: new_weight }
		}, (err) => {
			if (err) return cerror.net(err);
			u.weight = new_weight;
			weight_input.value = new_weight.toFixed(1);
			ui_render();
		});
	}

	weight_input.addEventListener('change', () => {
		save_weight(parseFloat(weight_input.value) || 1.0);
	});

	const btn_row = uiu.el(dlg, 'div', {style: 'margin-top: 20px; text-align: right;'});
	const close_btn = uiu.el(btn_row, 'button', {}, ci18n('Close'));
	close_btn.addEventListener('click', close);
}

function request_render() {
	if (render_timeout) return;
	const now = Date.now();
	const diff = now - last_render_request_ts;
	if (diff < 500) {
		render_timeout = setTimeout(() => {
			render_timeout = null;
			last_render_request_ts = Date.now();
			ui_render();
		}, 500 - diff);
	} else {
		last_render_request_ts = now;
		ui_render();
	}
}

function ui_render(full_rebuild) {
	const container = uiu.qs('.umpire_manage_container');
	if (!container) return;

	send({
		type: 'umpire_assignment_get',
		tournament_key: curt.key,
	}, (err, response) => {
		if (err) return cerror.net(err);
		if (full_rebuild) uiu.empty(container);

		const umpires = response.umpires;
		last_umpires_with_stats = umpires;
		const courts = curt.courts;
		const statuses = [
			{id: 'ready', color: '#4caf50', label: ci18n('umpire_manage:status:ready')},
			{id: 'oncourt', color: '#ffeb3b', label: ci18n('umpire_manage:status:oncourt')},
			{id: 'paused', color: '#ff9800', label: ci18n('umpire_manage:status:paused'), slidable: true},
			{id: 'away', color: '#9e9e9e', label: ci18n('umpire_manage:status:away'), slidable: true},
		];

		const slide_config = {
			paused: {
				direction: curt.umpire_manage_pause_direction || 'bottom',
				is_pinned: localStorage.getItem(`umpire_manage_pinned_paused`) === 'true',
			},
			away: {
				direction: curt.umpire_manage_away_direction || 'bottom',
				is_pinned: localStorage.getItem(`umpire_manage_pinned_away`) === 'true',
			}
		};

		statuses.forEach(status => {
			const is_slid_out = status.slidable && !slide_config[status.id].is_pinned;
			let group = container.querySelector(`.umpire_group[data-status-id="${status.id}"]`);
			if (!group) {
				group = uiu.el(container, 'div', {
					'class': 'umpire_group' + (is_slid_out ? ' umpire_group_sliding' : '') + (status.id === 'oncourt' ? ' oncourt_group' : ''),
				});
				group.dataset.statusId = status.id;
			} else {
				group.className = 'umpire_group' + (is_slid_out ? ' umpire_group_sliding' : '') + (status.id === 'oncourt' ? ' oncourt_group' : '');
			}

			let header = group.querySelector('.umpire_group_header');
			if (!header) {
				header = uiu.el(group, 'div', {
					'class': 'umpire_group_header',
				});
			}
			header.style.backgroundColor = status.color;

			const group_umpires = umpires.filter(u => u.calculated_status === status.id);
			if (status.id === 'ready') {
				group_umpires.sort((a, b) => b.priority_score - a.priority_score);
			}

			if (is_slid_out) {
				const dir = slide_config[status.id].direction;
				group.dataset.direction = dir;
				const other_slid_out = statuses.find(s => s.slidable && s.id !== status.id && !slide_config[s.id].is_pinned && slide_config[s.id].direction === dir);
				if (other_slid_out) {
					const is_first = status.id === 'paused';
					if (dir === 'bottom' || dir === 'top') {
						group.style.left = is_first ? 'calc(50% - 170px)' : 'calc(50% + 170px)';
					} else {
						group.style.top = is_first ? 'calc(50% - 170px)' : 'calc(50% + 170px)';
					}
				}
			} else {
				group.style.left = '';
				group.style.top = '';
			}

			let title_span = header.querySelector('.umpire_group_title');
			if (!title_span) {
				title_span = uiu.el(header, 'span', 'umpire_group_title');
			}
			uiu.text(title_span, `${status.label} (${group_umpires.length})`);

			if (status.id === 'oncourt' && courts) {
				let oncourt_container = group.querySelector('.umpire_oncourt_container');
				if (!oncourt_container) {
					oncourt_container = uiu.el(group, 'div', 'umpire_oncourt_container');
					oncourt_container.dataset.status = status.id;
				}

				// Find all existing court sections to maybe remove old ones
				const existing_court_sections = Array.from(oncourt_container.querySelectorAll('.umpire_court_section'));
				const court_ids = new Set(courts.map(c => c._id));
				existing_court_sections.forEach(s => {
					if (!court_ids.has(s.dataset.courtId)) {
						uiu.remove(s);
					}
				});

				courts.forEach(court => {
					let section = oncourt_container.querySelector(`.umpire_court_section[data-court-id="${court._id}"]`);
					if (!section) {
						section = uiu.el(oncourt_container, 'div', 'umpire_court_section');
						section.dataset.courtId = court._id;
						uiu.el(section, 'div', 'umpire_court_label', court.num);
						uiu.el(section, 'div', 'umpire_court_umpires');
					} else {
						const label = section.querySelector('.umpire_court_label');
						uiu.text(label, court.num);
					}
					const court_umpires_container = section.querySelector('.umpire_court_umpires');

					const court_umpires = group_umpires.filter(u => (u.on_court_court_id === court._id) || (u.on_court_court_id === court.num));
					const umpire = court_umpires.find(u => u.on_court_role === 'umpire');
					const sj = court_umpires.find(u => u.on_court_role === 'service_judge');
					const ljs = court_umpires.filter(u => u.on_court_role === 'line_judge');

					// Collect all umpire IDs that should be here
					const target_umpire_ids = court_umpires.map(u => u._id);
					const existing_tiles = Array.from(court_umpires_container.querySelectorAll('.umpire_tile'));
					existing_tiles.forEach(tile => {
						if (!target_umpire_ids.includes(tile.dataset.umpireId)) {
							uiu.remove(tile);
						}
					});

					if (umpire) {
						section.dataset.matchId = umpire.on_court_match_id;
						render_tile(court_umpires_container, umpire, false, !!sj);
					} else {
						delete section.dataset.matchId;
					}
					if (sj) {
						render_tile(court_umpires_container, sj, true);
					}
					ljs.forEach(lj => {
						render_tile(court_umpires_container, lj, false, false, true);
					});

					if (curt.line_judge_assignment_enabled && umpire) {
						section.classList.add('umpire_court_section_lj_target');
						if (!section.dataset.lj_events_bound) {
							section.addEventListener('dragover', (e) => {
								e.preventDefault();
								e.dataTransfer.dropEffect = 'move';
								section.classList.add('umpire_court_section_active');
							});
							section.addEventListener('dragleave', () => {
								section.classList.remove('umpire_court_section_active');
							});
							section.addEventListener('drop', (e) => {
								e.preventDefault();
								section.classList.remove('umpire_court_section_active');
								const umpire_id = e.dataTransfer.getData('umpire_id');
								const match_id = section.dataset.matchId;

								// Re-fetch current state of LJs from the match
								const current_match = curt.matches.find(m => m._id === match_id);
								if (!current_match) return;
								const current_ljs = current_match.line_judges || [];

								// If we're already a line judge on this court, do nothing
								if (current_ljs.includes(umpire_id)) return;

								const line_judges = current_ljs.slice();
								line_judges.push(umpire_id);
								send({
									type: 'match_set_line_judges',
									tournament_key: curt.key,
									match_id: match_id,
									line_judges: line_judges,
								}, (err) => {
									if (err) return cerror.net(err);
									ui_render();
								});
							});
							section.dataset.lj_events_bound = 'true';
						}
					} else {
						section.classList.remove('umpire_court_section_lj_target');
					}
				});
				return;
			}

			if (status.slidable) {
				let pin_btn = header.querySelector('.umpire_group_pinned_toggle');
				if (!pin_btn) {
					pin_btn = uiu.el(header, 'span', 'umpire_group_pinned_toggle');
					pin_btn.addEventListener('click', (e) => {
						e.stopPropagation();
						const was_pinned = localStorage.getItem(`umpire_manage_pinned_${status.id}`) === 'true';
						localStorage.setItem(`umpire_manage_pinned_${status.id}`, !was_pinned);
						ui_render();
					});
				}
				uiu.text(pin_btn, slide_config[status.id].is_pinned ? '📌' : '📍');
			}

			let list = group.querySelector('.umpire_list');
			if (!list) {
				list = uiu.el(group, 'div', 'umpire_list');
				list.dataset.status = status.id;

				if (is_slid_out) {
					header.addEventListener('dragenter', (e) => {
						e.preventDefault();
						group.classList.add('umpire_group_active');
					});
					header.addEventListener('dragover', (e) => {
						e.preventDefault();
					});
				}

				list.addEventListener('dragover', (e) => {
					e.preventDefault();
					e.dataTransfer.dropEffect = 'move';
					if (is_slid_out) {
						group.classList.add('umpire_group_active');
					}
				});

				list.addEventListener('dragleave', () => {
					if (is_slid_out) {
						group.classList.remove('umpire_group_active');
					}
				});

				list.addEventListener('drop', (e) => {
					e.preventDefault();
					const umpire_id = e.dataTransfer.getData('umpire_id');
					const new_status = status.id;

					if (is_slid_out) {
						group.classList.remove('umpire_group_active');
					}

					if (new_status === 'oncourt') return; // Cannot manually move to oncourt

					// We need to find the umpire in the current data
					const u = last_umpires_with_stats.find(u => u._id === umpire_id);
					if (u && u.on_court_role === 'line_judge') {
						// Remove from line judges
						const match_id = u.on_court_match_id;
						const match = curt.matches.find(m => m._id === match_id);
						if (!match) return;
						const line_judges = (match.line_judges || []).filter(id => id !== umpire_id);
						send({
							type: 'match_set_line_judges',
							tournament_key: curt.key,
							match_id: match_id,
							line_judges: line_judges,
						}, (err) => {
							if (err) return cerror.net(err);
							// Also set status
							send({
								type: 'umpire_edit_props',
								tournament_key: curt.key,
								id: umpire_id,
								props: {
									status: (new_status === 'ready' ? null : new_status),
									paused_since_ts: (new_status === 'paused' ? Date.now() : null),
								}
							}, (err) => {
								if (err) return cerror.net(err);
								ui_render();
							});
						});
						return;
					}

					send({
						type: 'umpire_edit_props',
						tournament_key: curt.key,
						id: umpire_id,
						props: {
							status: (new_status === 'ready' ? null : new_status),
							paused_since_ts: (new_status === 'paused' ? Date.now() : null),
						}
					}, (err) => {
						if (err) return cerror.net(err);
						ui_render();
					});
				});
			}

			// Clean up list: remove umpires that are no longer here
			const target_umpire_ids = group_umpires.map(u => u._id);
			const existing_tiles = Array.from(list.querySelectorAll('.umpire_tile'));
			existing_tiles.forEach(tile => {
				if (!target_umpire_ids.includes(tile.dataset.umpireId)) {
					uiu.remove(tile);
				}
			});

			// Append/Reorder tiles
			group_umpires.forEach((u, index) => {
				const tile = render_tile(list, u);
				// Sort check
				if (list.children[index] !== tile) {
					list.insertBefore(tile, list.children[index]);
				}
			});
		});
	});
}

function render_tile(container, u, is_sj, has_sj, is_lj) {
	const is_draggable = (u.calculated_status !== 'oncourt') || (is_lj && curt.line_judge_assignment_enabled);
	let tile = container.querySelector(`.umpire_tile[data-umpire-id="${u._id}"]`);
	if (!tile) {
		tile = uiu.el(container, 'div', {
			'class': 'umpire_tile',
		});
		tile.dataset.umpireId = u._id;

		tile.addEventListener('dragstart', (e) => {
			const hover_info = tile.querySelector('.umpire_tile_hover');
			if (hover_info) {
				uiu.hide(hover_info);
			}

			e.dataTransfer.setData('umpire_id', u._id);
			e.dataTransfer.effectAllowed = 'move';

			// Safari bug workaround: Use a hidden clone for the drag image
			if (e.dataTransfer.setDragImage) {
				const clone = tile.cloneNode(true);
				clone.style.position = 'absolute';
				clone.style.top = '-1000px';
				clone.style.width = tile.offsetWidth + 'px';
				document.body.appendChild(clone);
				e.dataTransfer.setDragImage(clone, 0, 0);
				setTimeout(() => {
					document.body.removeChild(clone);
				}, 0);
			}

			// Ensure only the tile is dragged, not surrounding content
			e.stopPropagation();
		});

		let hover_timeout;
		tile.addEventListener('mouseenter', () => {
			hover_timeout = setTimeout(() => {
				const hover_info = tile.querySelector('.umpire_tile_hover');
				if (hover_info) uiu.show(hover_info);
			}, 500);
		});
		tile.addEventListener('mousemove', (e) => {
			const hover_info = tile.querySelector('.umpire_tile_hover');
			if (hover_info) {
				hover_info.style.top = (e.clientY + 10) + 'px';
				hover_info.style.left = (e.clientX + 10) + 'px';
			}
		});
		tile.addEventListener('mouseleave', () => {
			clearTimeout(hover_timeout);
			const hover_info = tile.querySelector('.umpire_tile_hover');
			if (hover_info) uiu.hide(hover_info);
		});
	}

	tile.className = 'umpire_tile' + (is_sj ? ' umpire_tile_sj' : '') + (has_sj ? ' umpire_tile_with_sj' : '') + (is_lj ? ' umpire_tile_lj' : '');
	tile.setAttribute('draggable', (is_draggable ? 'true' : 'false'));

	let hover_info = tile.querySelector('.umpire_tile_hover');
	if (!hover_info) {
		hover_info = uiu.el(tile, 'div', {
			'class': 'umpire_tile_hover',
			style: 'display:none',
		});
		uiu.el(hover_info, 'div', 'umpire_total_matches');
		uiu.el(hover_info, 'div', 'umpire_today_matches');
	}
	uiu.text(hover_info.querySelector('.umpire_total_matches'), ci18n('umpire_manage:info:total_matches', {total: u.total_matches_all}));
	uiu.text(hover_info.querySelector('.umpire_today_matches'), ci18n('umpire_manage:info:today_matches', {today: u.total_matches_today}));

	let name_div = tile.querySelector('.umpire_tile_name');
	if (!name_div) {
		name_div = uiu.el(tile, 'div', 'umpire_tile_name');
	}
	let label = u.name;
	if (is_sj) label += ' (SJ)';
	else if (is_lj) label += ' (LJ)';
	uiu.text(name_div, label);

	let options_btn = tile.querySelector('.umpire_tile_options');
	if (!options_btn) {
		options_btn = uiu.el(tile, 'div', 'umpire_tile_options', '⋮');
		options_btn.addEventListener('click', (e) => {
			e.stopPropagation();
			const umpire_id = tile.dataset.umpireId;
			const current_u = last_umpires_with_stats.find(u => u._id === umpire_id);
			if (current_u) {
				ui_umpire_details(current_u);
			}
		});
	}

	// Update info sections
	const target_infos = [];
	if (u.calculated_status === 'ready') {
		target_infos.push(ci18n('umpire_manage:info:priority', {score: Math.round(u.priority_score / 60000)}));
		target_infos.push(ci18n('umpire_manage:info:last_match', {time: (u.last_match_end_ts ? utils.time_str(u.last_match_end_ts) : 'N/A')}));
	} else if (u.calculated_status === 'oncourt') {
		if (!is_sj && !is_lj) {
			if (u.on_court_match_start_ts) {
				const duration = Math.round((Date.now() - u.on_court_match_start_ts) / 60000);
				target_infos.push(ci18n('umpire_manage:info:duration', {minutes: duration}));
			} else {
				target_infos.push(ci18n('umpire_manage:info:not_started'));
			}
			if (u.on_court_match_score) {
				const score_str = u.on_court_match_score.map(s => s[0] + '-' + s[1]).join(' ');
				target_infos.push(ci18n('umpire_manage:info:score', {score: score_str}));
			}
		}
	} else if (u.calculated_status === 'paused') {
		const pause_duration = Math.round((Date.now() - u.paused_since_ts) / 60000);
		target_infos.push(ci18n('umpire_manage:info:paused_for', {minutes: pause_duration}));
	}

	const existing_infos = Array.from(tile.querySelectorAll('.umpire_tile_info'));
	while (existing_infos.length > target_infos.length) {
		uiu.remove(existing_infos.pop());
	}
	target_infos.forEach((text, i) => {
		let info_div = existing_infos[i];
		if (!info_div) {
			info_div = uiu.el(tile, 'div', 'umpire_tile_info');
		}
		uiu.text(info_div, text);
	});

	return tile;
}

function show_call_notification(match) {
	if (!curt.umpire_manage_call_match_enabled) return;

	const corner = curt.umpire_manage_call_match_corner || 'bottom-right';
	let container = document.querySelector(`.umpire_call_container_${corner}`);
	if (!container) {
		container = uiu.el(document.body, 'div', `umpire_call_container umpire_call_container_${corner}`);
	}

	let notification = container.querySelector(`.umpire_call_notification[data-match-id="${match._id}"]`);
	if (notification) {
		uiu.empty(notification);
	} else {
		notification = uiu.el(container, 'div', 'umpire_call_notification');
		notification.dataset.matchId = match._id;
	}

	function close() {
		if (notification.parentNode) {
			uiu.remove(notification);
		}
	}

	notification.addEventListener('click', close);

	uiu.el(notification, 'div', 'umpire_call_close', '×');

	const setup = match.setup;
	const call_lang = curt.umpire_manage_call_match_language || 'en';

	function t(key, data) {
		return ci18n._translate(call_lang, key, data);
	}

	function get_discipline_abbrev(setup) {
		const en = setup.event_name || '';
		if (setup.is_doubles) {
			if (en.includes('Mixed') || en.includes('GD') || en.includes('MX') || en.includes('XD')) return 'XD';
			if (en.includes('Men') || en.includes('HD') || en.includes('MD')) return 'MD';
			if (en.includes('Women') || en.includes('DD') || en.includes('WD')) return 'WD';
			return 'D';
		} else {
			if (en.includes('Men') || en.includes('HE') || en.includes('MS')) return 'MS';
			if (en.includes('Women') || en.includes('DE') || en.includes('WS')) return 'WS';
			return 'S';
		}
	}

	const discipline_abbrev = get_discipline_abbrev(setup);
	const discipline_abbrev_translated = t(`umpire_manage:call_match:discipline:abbrev:${discipline_abbrev}`);
	const discipline_full = t(`umpire_manage:call_match:discipline:${discipline_abbrev}`);

	let round = '';
	const mn = (setup.match_name || '').toLowerCase();
	if (mn.includes('final') || mn === 'f') round = t('umpire_manage:call_match:round:final');
	else if (mn.includes('semi') || mn === 'sf' || mn === 'hf') round = t('umpire_manage:call_match:round:semifinal');
	else if (mn.includes('3') || mn === '3/4') round = t('umpire_manage:call_match:round:3rd_place');

	const player_names_full = setup.teams.map(team =>
		team.players.map(p => p.name).join(' ' + t('umpire_manage:call_match:and') + ' ')
	).join(' ' + t('umpire_manage:call_match:vs') + ' ');

	const player_names_short = setup.teams.map(team =>
		team.players.map(p => p.name).join(' + ')
	).join(' vs. ');

	const court_num = setup.court_id ? (curt.courts.find(c => c._id === setup.court_id)?.num || setup.court_id) : '?';

	let age_class = '';
	const age_m = /([UuOo]\s*[0-9]+)/.exec(setup.event_name);
	if (age_m) age_class = ' ' + age_m[1].replace(/\s+/g, '');

	// Main info
	const info_list = uiu.el(notification, 'ul', 'umpire_call_info');
	uiu.el(info_list, 'li', {}, discipline_abbrev_translated + age_class);
	if (round) uiu.el(info_list, 'li', {}, round);
	uiu.el(info_list, 'li', {}, player_names_short);
	if (setup.umpire_name) uiu.el(info_list, 'li', {}, (t('umpire_manage:call_match:label_umpire') + ' ' + setup.umpire_name));
	if (curt.umpire_manage_call_match_optional_sj && setup.service_judge_name) {
		uiu.el(info_list, 'li', {}, (t('umpire_manage:call_match:label_sj') + ' ' + setup.service_judge_name));
	}
	if (curt.umpire_manage_call_match_optional_lj && match.line_judges && match.line_judges.length > 0) {
		const lj_names = match.line_judges.map(id => {
			const u = curt.umpires.find(u => u._id === id);
			return u ? u.name : id;
		}).join(', ');
		uiu.el(info_list, 'li', {}, (t('umpire_manage:call_match:label_lj') + ' ' + lj_names));
	}
	uiu.el(info_list, 'li', {}, (t('umpire_manage:call_match:label_court') + ' ' + court_num));

	if (curt.umpire_manage_call_match_exact_words) {
		let template_key = 'umpire_manage:call_match:template';
		const has_sj = curt.umpire_manage_call_match_optional_sj && setup.service_judge_name;
		const has_lj = curt.umpire_manage_call_match_optional_lj && match.line_judges && match.line_judges.length > 0;
		if (has_sj && has_lj) template_key = 'umpire_manage:call_match:template_sj_lj';
		else if (has_sj) template_key = 'umpire_manage:call_match:template_sj';
		else if (has_lj) template_key = 'umpire_manage:call_match:template_lj';

		const lj_names = has_lj ? match.line_judges.map(id => {
			const u = curt.umpires.find(u => u._id === id);
			return u ? u.name : id;
		}).join(', ') : '';

		const exact_words = t(template_key, {
			discipline: discipline_full,
			round: round || '',
			players: player_names_full,
			umpire: setup.umpire_name || '?',
			sj: setup.service_judge_name || '?',
			ljs: lj_names,
			court: court_num,
		}).replace(/, , /g, ', ').replace(/^, /, ''); // Fix empty round

		uiu.el(notification, 'div', 'umpire_call_exact', exact_words);

		if (localStorage.getItem('umpire_manage_call_match_read_call') === 'true') {
			queue_tts(exact_words, call_lang, match._id);
		}
	}

	const lifetime = curt.umpire_manage_call_match_lifetime;
	if (lifetime && lifetime > 0) {
		setTimeout(() => {
			if (notification.parentNode) {
				uiu.fadeout(notification, 4000);
				setTimeout(close, 4050);
			}
		}, lifetime * 1000);
	}
}

function dismiss_match_notifications(match_id) {
	const notifications = document.querySelectorAll(`.umpire_call_notification[data-match-id="${match_id}"]`);
	notifications.forEach(n => {
		uiu.fadeout(n, 4000);
		setTimeout(() => {
			if (n.parentNode) {
				uiu.remove(n);
			}
		}, 4050);
	});
}

crouting.register(/t\/([a-z0-9]+)\/umpire_manage$/, function(m) {
	ctournament.switch_tournament(m[1], function() {
		ui_show();
	});
}, change.default_handler(request_render));

function update_match(match_id) {
	const match = curt.matches.find(m => m._id === match_id);
	if (!match || !match.setup.court_id) return;

	const court_id = match.setup.court_id;
	const container = uiu.qs('.umpire_manage_container');
	if (!container) return;

	const section = container.querySelector(`.umpire_court_section[data-court-id="${court_id}"]`);
	if (!section) return;

	const tiles = section.querySelectorAll('.umpire_tile');
	tiles.forEach(tile => {
		const u_id = tile.dataset.umpireId;
		const u = last_umpires_with_stats.find(u => u._id === u_id);
		if (!u) return;

		// Locally update match data for render_tile
		u.on_court_match_score = match.network_score;
		if (match.presses && match.presses.length > 0) {
			u.on_court_match_start_ts = match.presses[0].timestamp;
		}

		// Re-derive roles to avoid visual regressions in render_tile
		const is_sj = u.on_court_role === 'service_judge';
		const is_lj = u.on_court_role === 'line_judge';
		const has_sj = !is_sj && !!last_umpires_with_stats.find(ou => ou.on_court_court_id === court_id && ou.on_court_role === 'service_judge');

		render_tile(section.querySelector('.umpire_court_umpires'), u, is_sj, has_sj, is_lj);
	});
}

return {
	ui_show,
	ui_render,
	request_render,
	update_match,
	show_call_notification,
	dismiss_match_notifications,
};

})();

/*@DEV*/
if ((typeof module !== 'undefined') && (typeof require !== 'undefined')) {
	var ci18n = require('./ci18n.js');
	var change = require('./change.js');
	var crouting = require('./crouting.js');
	var ctournament = require('./ctournament.js');
	var toprow = require('./toprow.js');
	var uiu = require('../bup/js/uiu.js');
	var utils = require('../bup/js/utils.js');

	module.exports = cumpire_manage;
}
/*/@DEV*/
