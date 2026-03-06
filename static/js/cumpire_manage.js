'use strict';

var cumpire_manage = (function() {

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
	ui_render();
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
	if (curt.umpire_tracking_enabled) tracking_cb.checked = true;
	uiu.el(tracking_label, 'span', {}, ' ' + ci18n('umpire_manage:tracking_enabled'));

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

	function update_disabled() {
		if (!tracking_cb.checked) {
			assignment_cb.disabled = true;
			sj_cb.disabled = true;
		} else {
			assignment_cb.disabled = false;
			sj_cb.disabled = !assignment_cb.checked;
		}
	}
	update_disabled();

	tracking_cb.addEventListener('change', update_disabled);
	assignment_cb.addEventListener('change', update_disabled);

	const btn_row = uiu.el(dlg, 'div', {style: 'margin-top: 20px; text-align: right;'});
	const cancel_btn = uiu.el(btn_row, 'button', {style: 'margin-right: 10px;'}, ci18n('Cancel'));
	cancel_btn.addEventListener('click', close);

	const ok_btn = uiu.el(btn_row, 'button', {}, ci18n('Change'));
	ok_btn.addEventListener('click', () => {
		const props = {
			umpire_tracking_enabled: tracking_cb.checked,
			umpire_assignment_enabled: (tracking_cb.checked && assignment_cb.checked),
			service_judge_assignment_enabled: (tracking_cb.checked && assignment_cb.checked && sj_cb.checked),
			umpire_manage_pause_direction: pause_dir_select.value,
			umpire_manage_away_direction: away_dir_select.value,
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

function ui_render() {
	const container = uiu.qs('.umpire_manage_container');
	if (!container) return;

	send({
		type: 'umpire_assignment_get',
		tournament_key: curt.key,
	}, (err, response) => {
		if (err) return cerror.net(err);
		uiu.empty(container);

		const umpires = response.umpires;
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
			const group = uiu.el(container, 'div', 'umpire_group' + (is_slid_out ? ' umpire_group_sliding' : '') + (status.id === 'oncourt' ? ' oncourt_group' : ''));
			const header = uiu.el(group, 'div', {
				'class': 'umpire_group_header',
				style: `background-color: ${status.color}`,
			});

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
			}

			const title_span = uiu.el(header, 'span', 'umpire_group_title');
			uiu.text(title_span, `${status.label} (${group_umpires.length})`);

			if (status.id === 'oncourt' && courts) {
				const oncourt_container = uiu.el(group, 'div', 'umpire_oncourt_container');
				oncourt_container.dataset.status = status.id;
				courts.forEach(court => {
					const section = uiu.el(oncourt_container, 'div', 'umpire_court_section');
					uiu.el(section, 'div', 'umpire_court_label', court.num);
					const court_umpires_container = uiu.el(section, 'div', 'umpire_court_umpires');

					const court_umpires = group_umpires.filter(u => (u.on_court_court_id === court._id) || (u.on_court_court_id === court.num));
					const umpire = court_umpires.find(u => u.on_court_role === 'umpire');
					const sj = court_umpires.find(u => u.on_court_role === 'service_judge');

					if (umpire) {
						render_tile(court_umpires_container, umpire, false, !!sj);
					}
					if (sj) {
						render_tile(court_umpires_container, sj, true);
					}
				});
				return;
			}

			if (status.slidable) {
				const pin_btn = uiu.el(header, 'span', 'umpire_group_pinned_toggle', slide_config[status.id].is_pinned ? '📌' : '📍');
				pin_btn.addEventListener('click', (e) => {
					e.stopPropagation();
					const was_pinned = localStorage.getItem(`umpire_manage_pinned_${status.id}`) === 'true';
					localStorage.setItem(`umpire_manage_pinned_${status.id}`, !was_pinned);
					ui_render();
				});
			}

			const list = uiu.el(group, 'div', 'umpire_list');
			list.dataset.status = status.id;

			if (status.id === 'oncourt' && courts) {
				const oncourt_container = uiu.el(group, 'div', 'umpire_oncourt_container');
				courts.forEach(court => {
					const section = uiu.el(oncourt_container, 'div', 'umpire_court_section');
					uiu.el(section, 'div', 'umpire_court_label', court.num);
					const court_umpires_container = uiu.el(section, 'div', 'umpire_court_umpires');

					const court_umpires = group_umpires.filter(u => (u.on_court_court_id === court._id) || (u.on_court_court_id === court.num));
					const umpire = court_umpires.find(u => u.on_court_role === 'umpire');
					const sj = court_umpires.find(u => u.on_court_role === 'service_judge');

					if (umpire) {
						render_tile(court_umpires_container, umpire, false, !!sj);
					}
					if (sj) {
						render_tile(court_umpires_container, sj, true);
					}
				});
				return;
			}

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

			function render_tile(container, u, is_sj, has_sj) {
				const tile = uiu.el(container, 'div', {
					'class': 'umpire_tile' + (is_sj ? ' umpire_tile_sj' : '') + (has_sj ? ' umpire_tile_with_sj' : ''),
					draggable: (u.calculated_status !== 'oncourt' ? 'true' : 'false'),
				});
				tile.dataset.umpireId = u._id;

				let hover_timeout;
				const hover_info = uiu.el(tile, 'div', {
					'class': 'umpire_tile_hover',
					style: 'display:none',
				});
				const total_div = uiu.el(hover_info, 'div');
				uiu.text(total_div, ci18n('umpire_manage:info:total_matches', {total: u.total_matches_all}));
				const today_div = uiu.el(hover_info, 'div');
				uiu.text(today_div, ci18n('umpire_manage:info:today_matches', {today: u.total_matches_today}));

				tile.addEventListener('dragstart', (e) => {
					clearTimeout(hover_timeout);
					uiu.hide(hover_info);

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

				const name_div = uiu.el(tile, 'div', 'umpire_tile_name');
				uiu.text(name_div, u.name + (is_sj ? ' (SJ)' : ''));

				const options_btn = uiu.el(tile, 'div', 'umpire_tile_options', '⋮');
				options_btn.addEventListener('click', (e) => {
					e.stopPropagation();
					ui_umpire_details(u);
				});

				if (u.calculated_status === 'ready') {
					uiu.el(tile, 'div', 'umpire_tile_info', ci18n('umpire_manage:info:priority', {score: Math.round(u.priority_score / 60000)}));
					uiu.el(tile, 'div', 'umpire_tile_info', ci18n('umpire_manage:info:last_match', {time: (u.last_match_end_ts ? utils.time_str(u.last_match_end_ts) : 'N/A')}));
				} else if (u.calculated_status === 'oncourt') {
					if (u.on_court_match_start_ts) {
						const duration = Math.round((Date.now() - u.on_court_match_start_ts) / 60000);
						uiu.el(tile, 'div', 'umpire_tile_info', ci18n('umpire_manage:info:duration', {minutes: duration}));
					} else {
						uiu.el(tile, 'div', 'umpire_tile_info', ci18n('umpire_manage:info:not_started'));
					}
					if (u.on_court_match_score) {
						const score_str = u.on_court_match_score.map(s => s[0] + '-' + s[1]).join(' ');
						uiu.el(tile, 'div', 'umpire_tile_info', ci18n('umpire_manage:info:score', {score: score_str}));
					}
				} else if (u.calculated_status === 'paused') {
					const pause_duration = Math.round((Date.now() - u.paused_since_ts) / 60000);
					uiu.el(tile, 'div', 'umpire_tile_info', ci18n('umpire_manage:info:paused_for', {minutes: pause_duration}));
				}

				tile.addEventListener('mouseenter', () => {
					hover_timeout = setTimeout(() => {
						uiu.show(hover_info);
					}, 500);
				});
				tile.addEventListener('mousemove', (e) => {
					hover_info.style.top = (e.clientY + 10) + 'px';
					hover_info.style.left = (e.clientX + 10) + 'px';
				});
				tile.addEventListener('mouseleave', () => {
					clearTimeout(hover_timeout);
					uiu.hide(hover_info);
				});
			}

			group_umpires.forEach(u => render_tile(list, u));
		});
	});
}

crouting.register(/t\/([a-z0-9]+)\/umpire_manage$/, function(m) {
	ctournament.switch_tournament(m[1], function() {
		ui_show();
	});
}, change.default_handler(ui_show));

return {
	ui_show,
	ui_render,
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
