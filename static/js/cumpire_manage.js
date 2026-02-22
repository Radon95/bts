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

	const tracking_label = uiu.el(dlg, 'label', {style: 'display: block; margin-bottom: 10px;'});
	const tracking_cb = uiu.el(tracking_label, 'input', {
		type: 'checkbox',
	});
	if (curt.umpire_tracking_enabled) tracking_cb.checked = true;
	uiu.el(tracking_label, 'span', {}, ' ' + ci18n('umpire_manage:tracking_enabled'));

	const assignment_label = uiu.el(dlg, 'label', {style: 'display: block; margin-bottom: 10px;'});
	const assignment_cb = uiu.el(assignment_label, 'input', {
		type: 'checkbox',
	});
	if (curt.umpire_assignment_enabled) assignment_cb.checked = true;
	uiu.el(assignment_label, 'span', {}, ' ' + ci18n('umpire_manage:assignment_enabled'));

	const sj_label = uiu.el(dlg, 'label', {style: 'display: block; margin-bottom: 10px;'});
	const sj_cb = uiu.el(sj_label, 'input', {
		type: 'checkbox',
	});
	if (curt.service_judge_assignment_enabled) sj_cb.checked = true;
	uiu.el(sj_label, 'span', {}, ' ' + ci18n('umpire_manage:sj_assignment_enabled'));

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

function ui_render() {
	const container = uiu.qs('.umpire_manage_container');
	if (!container) return;
	uiu.empty(container);

	send({
		type: 'umpire_assignment_get',
		tournament_key: curt.key,
	}, (err, response) => {
		if (err) return cerror.net(err);

		const umpires = response.umpires;
		const statuses = [
			{id: 'ready', color: '#4caf50', label: ci18n('umpire_manage:status:ready')},
			{id: 'oncourt', color: '#ffeb3b', label: ci18n('umpire_manage:status:oncourt')},
			{id: 'paused', color: '#ff9800', label: ci18n('umpire_manage:status:paused'), collapsible: true},
			{id: 'away', color: '#9e9e9e', label: ci18n('umpire_manage:status:away'), collapsible: true},
		];

		statuses.forEach(status => {
			const group = uiu.el(container, 'div', 'umpire_group');
			const header = uiu.el(group, 'div', {
				'class': 'umpire_group_header',
				style: `background-color: ${status.color}`,
			});

			const group_umpires = umpires.filter(u => u.calculated_status === status.id);
			if (status.id === 'ready') {
				group_umpires.sort((a, b) => b.priority_score - a.priority_score);
			}

			const title_span = uiu.el(header, 'span', 'umpire_group_title');
			const prefix = status.collapsible ? (localStorage.getItem(`umpire_manage_collapsed_${status.id}`) === 'true' ? '▶ ' : '▼ ') : '';
			uiu.text(title_span, `${prefix}${status.label} (${group_umpires.length})`);

			const list = uiu.el(group, 'div', 'umpire_list');
			list.dataset.status = status.id;

			if (status.collapsible) {
				const is_collapsed = localStorage.getItem(`umpire_manage_collapsed_${status.id}`) === 'true';
				if (is_collapsed) {
					list.style.display = 'none';
				}
				header.style.cursor = 'pointer';
				header.addEventListener('click', () => {
					const currently_collapsed = localStorage.getItem(`umpire_manage_collapsed_${status.id}`) === 'true';
					list.style.display = currently_collapsed ? 'block' : 'none';
					localStorage.setItem(`umpire_manage_collapsed_${status.id}`, !currently_collapsed);
					uiu.text(title_span, (currently_collapsed ? '▼ ' : '▶ ') + `${status.label} (${group_umpires.length})`);
				});

				group.addEventListener('mouseenter', () => {
					list.style.display = 'block';
				});
				group.addEventListener('mouseleave', () => {
					if (localStorage.getItem(`umpire_manage_collapsed_${status.id}`) === 'true') {
						list.style.display = 'none';
					}
				});
			}

			list.addEventListener('dragover', (e) => {
				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';
			});

			list.addEventListener('drop', (e) => {
				e.preventDefault();
				const umpire_id = e.dataTransfer.getData('umpire_id');
				const new_status = status.id;

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

			group_umpires.forEach(u => {
				const tile = uiu.el(list, 'div', {
					'class': 'umpire_tile',
					draggable: (u.calculated_status !== 'oncourt' ? 'true' : 'false'),
				});
				tile.dataset.umpireId = u._id;

				tile.addEventListener('dragstart', (e) => {
					e.dataTransfer.setData('umpire_id', u._id);
					e.dataTransfer.effectAllowed = 'move';
				});

				uiu.el(tile, 'div', 'umpire_tile_name', u.name);

				if (u.calculated_status === 'ready') {
					uiu.el(tile, 'div', 'umpire_tile_info', ci18n('umpire_manage:info:priority', {score: Math.round(u.priority_score / 60000)}));
					uiu.el(tile, 'div', 'umpire_tile_info', ci18n('umpire_manage:info:last_match', {time: (u.last_match_end_ts ? utils.time_str(u.last_match_end_ts) : 'N/A')}));

					const weight_container = uiu.el(tile, 'div', 'umpire_tile_weight');
					uiu.el(weight_container, 'span', {}, 'Weight: ');
					const weight_input = uiu.el(weight_container, 'input', {
						type: 'number',
						step: '0.1',
						value: (u.weight !== undefined ? u.weight : 1.0),
						style: 'width: 40px',
					});
					weight_input.addEventListener('change', () => {
						send({
							type: 'umpire_edit_props',
							tournament_key: curt.key,
							id: u._id,
							props: { weight: parseFloat(weight_input.value) }
						}, (err) => {
							if (err) return cerror.net(err);
							ui_render();
						});
					});
				} else if (u.calculated_status === 'oncourt') {
					uiu.el(tile, 'div', 'umpire_tile_info', ci18n('umpire_manage:info:court', {court: u.on_court_court_id}));
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

				const hover_info = uiu.el(tile, 'div', {
					'class': 'umpire_tile_hover',
					style: 'display:none',
				});
				const total_div = uiu.el(hover_info, 'div');
				uiu.text(total_div, ci18n('umpire_manage:info:total_matches', {total: u.total_matches_all}));
				const today_div = uiu.el(hover_info, 'div');
				uiu.text(today_div, ci18n('umpire_manage:info:today_matches', {today: u.total_matches_today}));

				tile.addEventListener('mouseenter', () => uiu.show(hover_info));
				tile.addEventListener('mousemove', (e) => {
					hover_info.style.top = (e.clientY + 10) + 'px';
					hover_info.style.left = (e.clientX + 10) + 'px';
				});
				tile.addEventListener('mouseleave', () => uiu.hide(hover_info));
			});
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
