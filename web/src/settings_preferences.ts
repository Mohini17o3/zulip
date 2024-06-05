import $ from "jquery";
import Cookies from "js-cookie";
import assert from "minimalistic-assert";

import render_dialog_default_language from "../templates/default_language_modal.hbs";

import * as channel from "./channel";
import * as dialog_widget from "./dialog_widget";
import * as emojisets from "./emojisets";
import * as hash_parser from "./hash_parser";
import {$t_html, get_language_list_columns, get_language_name} from "./i18n";
import * as loading from "./loading";
import * as overlays from "./overlays";
import {page_params} from "./page_params";
import * as settings_components from "./settings_components";
import type {GenericUserSettings} from "./settings_config";
import * as settings_ui from "./settings_ui";
import {realm} from "./state_data";
import * as ui_report from "./ui_report";
import {user_settings} from "./user_settings";
import type {UserSettings} from "./user_settings";

type SettingsPanel = {
    container: string;
    settings_object: GenericUserSettings;
    for_realm_settings: boolean;
    notification_sound_elem: string | null;
};

type UserSettingsProperty = keyof UserSettings;

const meta = {
    loaded: false,
};

export let user_settings_panel: SettingsPanel;

export let user_default_language_name: string | undefined;

export function set_default_language_name(name: string | undefined): void {
    user_default_language_name = name;
}

function change_display_setting(
    data: Record<string, string | boolean | number>,
    $status_el: JQuery,
    success_msg_html?: string,
    sticky?: boolean,
): void {
    const status_is_sticky = $status_el.attr("data-is_sticky") === "true";
    const display_message_html = status_is_sticky
        ? $status_el.attr("data-sticky_msg_html")
        : success_msg_html;
    const opts = {
        success_msg_html: display_message_html,
        sticky: status_is_sticky || sticky,
    };

    if (sticky && success_msg_html) {
        $status_el.attr("data-is_sticky", "true");
        $status_el.attr("data-sticky_msg_html", success_msg_html);
    }
    settings_ui.do_settings_change(channel.patch, "/json/settings", data, $status_el, opts);
}

function spectator_default_language_modal_post_render(): void {
    $("#language_selection_modal")
        .find(".language")
        .on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            dialog_widget.close();

            assert(
                page_params.language_cookie_name !== undefined,
                "Expected language_cookie_name present for spectator",
            );

            const $link = $(e.target).closest("a[data-code]");
            Cookies.set(page_params.language_cookie_name, $link.attr("data-code")!);
            window.location.reload();
        });
}

function org_notification_default_language_modal_post_render(): void {
    $("#language_selection_modal")
        .find(".language")
        .on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            dialog_widget.close();

            const $link = $(e.target).closest("a[data-code]");
            const setting_value = $link.attr("data-code");
            assert(setting_value !== undefined);
            const new_language = $link.attr("data-name");
            assert(new_language !== undefined);
            const $language_element = $(
                "#org-notifications .language_selection_widget .language_selection_button span",
            );
            $language_element.text(new_language);
            $language_element.attr("data-language-code", setting_value);
            settings_components.save_discard_realm_settings_widget_status_handler(
                $("#org-notifications"),
            );
        });
}

function user_default_language_modal_post_render(): void {
    $("#language_selection_modal")
        .find(".language")
        .on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            dialog_widget.close();

            const $link = $(e.target).closest("a[data-code]");
            const setting_value = $link.attr("data-code");
            assert(setting_value !== undefined);
            const data = {default_language: setting_value};

            const new_language = $link.attr("data-name");
            assert(new_language !== undefined);
            $("#user-preferences .language_selection_widget .language_selection_button span").text(
                new_language,
            );
            $("#user-preferences .language_selection_widget .language_selection_button span").attr(
                "data-language-code",
                setting_value,
            );

            change_display_setting(
                data,
                $("#settings_content").find(".general-settings-status"),
                $t_html(
                    {
                        defaultMessage:
                            "Saved. Please <z-link>reload</z-link> for the change to take effect.",
                    },
                    {
                        "z-link": (content_html) =>
                            `<a class='reload_link'>${content_html.join("")}</a>`,
                    },
                ),
                true,
            );
        });
}

function default_language_modal_post_render(): void {
    if (page_params.is_spectator) {
        spectator_default_language_modal_post_render();
    } else if (hash_parser.get_current_hash_category() === "organization") {
        org_notification_default_language_modal_post_render();
    } else {
        user_default_language_modal_post_render();
    }
}

export function launch_default_language_setting_modal(): void {
    let selected_language = user_settings.default_language;

    if (hash_parser.get_current_hash_category() === "organization") {
        selected_language = realm.realm_default_language;
    }

    const html_body = render_dialog_default_language({
        language_list: get_language_list_columns(selected_language),
    });

    dialog_widget.launch({
        html_heading: $t_html({defaultMessage: "Select language"}),
        html_body,
        html_submit_button: $t_html({defaultMessage: "Close"}),
        id: "language_selection_modal",
        close_on_submit: true,
        focus_submit_on_open: true,
        single_footer_button: true,
        post_render: default_language_modal_post_render,
        on_click() {
            // We perform no actions since the 'close_on_submit' field takes care
            // of closing the modal.
        },
    });
}

export function set_up(settings_panel: SettingsPanel): void {
    meta.loaded = true;
    const $container = $(settings_panel.container);
    const settings_object = settings_panel.settings_object;
    const for_realm_settings = settings_panel.for_realm_settings;

    $container.find(".advanced-settings-status").hide();

    // Select current values for enum/select type fields. For boolean
    // fields, the current value is set automatically in the template.
    $container
        .find(".setting_demote_inactive_streams")
        .val(settings_object.demote_inactive_streams);
    $container.find(".setting_color_scheme").val(settings_object.color_scheme);
    $container.find(".setting_web_home_view").val(settings_object.web_home_view);
    $container
        .find(".setting_twenty_four_hour_time")
        .val(JSON.stringify(settings_object.twenty_four_hour_time));
    $container
        .find(".setting_web_mark_read_on_scroll_policy")
        .val(settings_object.web_mark_read_on_scroll_policy);
    $container
        .find(`.setting_emojiset_choice[value="${CSS.escape(settings_object.emojiset)}"]`)
        .prop("checked", true);
    $container
        .find(`.setting_user_list_style_choice[value=${settings_object.user_list_style}]`)
        .prop("checked", true);

    $container
        .find(".setting_web_stream_unreads_count_display_policy")
        .val(settings_object.web_stream_unreads_count_display_policy);

    if (for_realm_settings) {
        // For the realm-level defaults page, we use the common
        // settings_org.js handlers, so we can return early here.
        return;
    }

    // Common handler for sending requests to the server when an input
    // element is changed.
    $container.on(
        "change",
        "input[type=checkbox], .information-density-settings input[type=text], select",
        function (this: HTMLElement, e) {
            const $input_elem = $(e.currentTarget);
            const setting = $input_elem.attr("name");
            assert(setting !== undefined);
            const data: Record<string, string | boolean | number> = {};
            data[setting] = settings_components.get_input_element_value(this)!;
            const $status_element = $input_elem
                .closest(".subsection-parent")
                .find(".alert-notification");
            change_display_setting(data, $status_element);
        },
    );

    $container.find(".setting_emojiset_choice").on("click", function () {
        const data = {emojiset: $(this).val()};
        const current_emojiset = settings_object.emojiset;
        if (current_emojiset === data.emojiset) {
            return;
        }
        const $spinner = $container.find(".emoji-preferences-settings-status").expectOne();
        loading.make_indicator($spinner, {text: settings_ui.strings.saving});

        void channel.patch({
            url: "/json/settings",
            data,
            success() {
                // We don't launch any success report, since it is currently handled
                // by function report_emojiset_change.
            },
            error(xhr) {
                ui_report.error(
                    settings_ui.strings.failure_html,
                    xhr,
                    $container.find(".emoji-preferences-settings-status").expectOne(),
                );
            },
        });
    });

    $container.find(".setting_user_list_style_choice").on("click", function () {
        const data = {user_list_style: $(this).val()};
        const current_user_list_style = settings_object.user_list_style;
        if (current_user_list_style === data.user_list_style) {
            return;
        }
        const $spinner = $container.find(".advanced-settings-status").expectOne();
        loading.make_indicator($spinner, {text: settings_ui.strings.saving});

        void channel.patch({
            url: "/json/settings",
            data,
            success() {
                // We don't launch any success report, since it is
                // currently handled by report_user_list_style_change.
            },
            error(xhr) {
                ui_report.error(
                    settings_ui.strings.failure_html,
                    xhr,
                    $container.find(".advanced-settings-status").expectOne(),
                );
            },
        });
    });
}

export async function report_emojiset_change(settings_panel: SettingsPanel): Promise<void> {
    // TODO: Clean up how this works so we can use
    // change_display_setting.  The challenge is that we don't want to
    // report success before the server_events request returns that
    // causes the actual sprite sheet to change.  The current
    // implementation is wrong, though, in that it displays the UI
    // update in all active browser windows.
    await emojisets.select(settings_panel.settings_object.emojiset);

    const $spinner = $(settings_panel.container).find(".emoji-preferences-settings-status");
    if ($spinner.length) {
        loading.destroy_indicator($spinner);
        ui_report.success(
            $t_html({defaultMessage: "Emoji set changed successfully!"}),
            $spinner.expectOne(),
            1000,
        );
        $spinner.expectOne();
        settings_ui.display_checkmark($spinner);
    }
}

export function report_user_list_style_change(settings_panel: SettingsPanel): void {
    // TODO: Clean up how this works so we can use
    // change_display_setting.  The challenge is that we don't want to
    // report success before the server_events request returns that
    // causes the actual sprite sheet to change.  The current
    // implementation is wrong, though, in that it displays the UI
    // update in all active browser windows.
    const $spinner = $(settings_panel.container).find(".advanced-settings-status");
    if ($spinner.length) {
        loading.destroy_indicator($spinner);
        ui_report.success(
            $t_html({defaultMessage: "User list style changed successfully!"}),
            $spinner.expectOne(),
            1000,
        );
        $spinner.expectOne();
        settings_ui.display_checkmark($spinner);
    }
}

export function update_page(property: UserSettingsProperty): void {
    if (!overlays.settings_open()) {
        return;
    }
    const $container = $(user_settings_panel.container);
    let value = user_settings[property];

    // The default_language button text updates to the language
    // name and not the value of the user_settings property.
    if (property === "default_language") {
        $container.find(".default_language_name").text(user_default_language_name ?? "");
        return;
    }

    // settings_org.set_input_element_value doesn't support radio
    // button widgets like these.
    if (property === "emojiset" || property === "user_list_style") {
        $container.find(`input[value=${CSS.escape(value.toString())}]`).prop("checked", true);
        return;
    }

    // The twenty_four_hour_time setting is represented as a boolean
    // in the API, but a dropdown with "true"/"false" as strings in
    // the UI, so we need to convert its format here.
    if (property === "twenty_four_hour_time") {
        value = value.toString();
    }

    const $input_elem = $container.find(`[name=${CSS.escape(property)}]`);
    settings_components.set_input_element_value($input_elem, value);
}

export function initialize(): void {
    const user_language_name = get_language_name(user_settings.default_language);
    set_default_language_name(user_language_name);

    user_settings_panel = {
        container: "#user-preferences",
        settings_object: user_settings,
        for_realm_settings: false,
        notification_sound_elem: null,
    };
}
