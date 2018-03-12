'use strict';
const remote  = require('electron').remote;
const ipc     = require("electron").ipcRenderer;
const Request = require('request-promise');

let Config = remote.getGlobal('Config');
let Lang   = remote.getGlobal('Lang');
let GSuser = remote.getGlobal('user');

let TrayIcon    = remote.getGlobal('TrayIcon');
let shell       = remote.getGlobal('shell');
let Browser     = remote.getGlobal('Browser');
let authWindow  = remote.getGlobal('authWindow');
let mainWindow  = remote.getGlobal('mainWindow');

let intervalTicks = 0;

$(function(){
	// Основной воркер главного окна
	setInterval(intervalSchedules, 1000);

	// UI LOAD
	reloadLangStrings();
	profileSection();

	// Восстановление сохранённых настроек
	let setters = $('.settings .setter').each(function(){
		let item = $(this);

		switch(item.attr('type')){
			case 'checkbox':
				item.prop('checked', Config.get(item.attr('id')));
				break;
		}
	});

	// Переключение типа отображения иконок сервисов
	let menu_switcher = $('.list_type');
	if( Config.get("menu_as_list") )
		menu_switcher.addClass('state');


	// Смена окон по окончании рендеринга
	authWindow.hide();
    mainWindow.show();

	if( Config.get('start_minimized') )
        mainWindow.hide();
    else
        mainWindow.focus();


	// EVENTS

	let icons  = $('.services-icons');
	let maxTop = parseInt(icons.css('top').replace('px', ''));

	$('.services_switcher').bind('mousewheel', function(e) {
		let scroll = e.originalEvent.wheelDelta / 120 > 0 ? 20 : -20;

		let height = icons.height();
		let minTop = $(this).height() - height;
		let top    = parseInt(icons.css('top').replace('px', ''));
		let newTop = top + scroll;

		if( scroll > 0 && newTop <= maxTop || scroll < 0 && newTop >= minTop )
			top = newTop;

		icons.css('top', top + 'px');
	});

	menu_switcher.click(function () {
		$(this).toggleClass('state');

		icons.css('top', maxTop + 'px');

		Config.set("menu_as_list", $(this).hasClass('state'));
	});

	// Переключение основных пунктов меню
	$('.menu li span').click(function(){
		let parent = $(this).parent();
		$('.menu li, .content-item').removeClass('active');

		parent.add('.content-item[data-id="' + parent.attr('data-id') + '"]').addClass('active');
	});

	// Переключение вкладок внутри сервиса - переключаем сразу во всех сервисах
	$(document).on('click', '.service-panel > ul li', function() {
		$('.service-panel > ul li, .in-service-panel').removeClass('active');
		$('.in-service-panel[data-id="' + $(this).attr('data-id') + '"]')
			.add('.service-panel > ul li[data-id="' + $(this).attr('data-id') + '"]').addClass('active');
	});

	// Клик по кнопке выхода из авторизованного аккаунта
	$('.seeker-button.logout').click(function () {
		let clicked = $(this).addClass('disabled');

		$.ajax({
			method: 'get',
			url: 'http://giftseeker.ru/logout',
			success: function () {
				mainWindow.hide();
				mainWindow.loadURL(__dirname + '/blank.html');

                ipc.send('save-user', null);
				authWindow.show();
			},
			error: function () {
				clicked.removeClass('disabled');
				alert('something went wrong...');
			}
		});
	});

	// Изменение настроек
	setters.change(function () {
		let changed = $(this);
		let value   = changed.val();

		switch(changed.attr('type')){
			case 'checkbox':
				value = changed.prop('checked');
				break;
		}

		if( changed.attr('id') === 'lang' ){
			ipc.send('change-lang', value);
			return;
		}

		Config.set(changed.attr('id'), value);
	});

	ipc.on('change-lang', function(){
		reloadLangStrings();
	});
});

function intervalSchedules(){
	// Проверяем обновления
	if( intervalTicks % 600 === 0 ){
		$.ajax({
			url: 'http://giftseeker.ru/api/version',
			dataType: 'json',
			success: function(data){
				if( data.response && data.response !== currentBuild ) {
					TrayIcon.displayBalloon({
						icon: __dirname + '/icon.png',
						title: Lang.get('ui.upd_title'),
						content: Lang.get('ui.upd_text')
					});

					TrayIcon.once('balloon-click', function(){
						shell.openExternal('http://giftseeker.ru/downloads')
					});
				}
			}
		});
	}

	// Обновляем инфо о юзере
	if( intervalTicks !== 0 && intervalTicks % 300 === 0 ){
		$.ajax({
			url: 'http://giftseeker.ru/api/userData',
			data: { ver: currentBuild },
			dataType: 'json',
			success: function(data){
				if( data.response )
					renderUser(data.response);
			}
		});
	}

	intervalTicks++;
}

function reloadLangStrings() {
	$('[data-lang]').each(function(){
		$(this).html(Lang.get($(this).attr('data-lang')));
	});

	$('[data-lang-title]').each(function(){
		$(this).attr('title', Lang.get($(this).attr('data-lang-title')));
	});
}

function profileSection() {
	renderUser(GSuser);

	$('.build .version').text(currentBuild);

    let lang_select = $('select#lang');
    let lang_list	= Lang.list();

    // Наполняем языковой селект, либо удаляем его
    if( Lang.count() <= 1 )
        lang_select.remove();
    else{
        for(let lang in lang_list){
            let option = $(document.createElement('option'))
	            .attr('id', lang_list[lang].lang_culture)
                .val(lang).text('[' + lang_list[lang].lang_culture + '] ' + lang_list[lang].lang_name);

            if( Config.get('lang') === lang )
                option.prop('selected', true);

            lang_select.append(option);
        }
    }


    // Ссылки внизу
    let info_links = $('.content-item .info-links');

    $(document.createElement('button'))
        .addClass('open-website')
        .text('GiftSeeker.RU')
        .click(() => {
            openWebsite('http://giftseeker.ru/');
        }).appendTo(info_links);

    $(document.createElement('button'))
        .addClass('open-website')
        .attr('data-lang', 'profile.forum')
        .text(Lang.get('profile.forum'))
        .css('margin-left', '7px')
        .click(() => {
            openWebsite('http://iknows.ru/forums/gs/');
        }).appendTo(info_links);

	$(document.createElement('button'))
		.addClass('open-website')
		.attr('data-lang', 'profile.donation')
		.text(Lang.get('profile.donation'))
		.css('margin-left', '7px')
		.click(() => {
			openWebsite('http://giftseeker.ru/donation');
		}).appendTo(info_links);
}

function renderUser(userData) {
	$('.content-item .info .avatar').css({'background-image': 'url("' + userData.avatar + '")'});
	$('.content-item .info .username').html(userData.username);
}

function openWebsite(url){
    Browser.loadURL(url);
    Browser.show();
    Browser.setTitle('GS Browser - ' + Lang.get('auth.browser_loading'));
}