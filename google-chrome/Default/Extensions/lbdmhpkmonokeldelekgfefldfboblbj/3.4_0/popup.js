
function validateView(is_enabled) {
    var controllable_block      = document.getElementById('not-controllable');
    var inform_icon             = document.getElementById('inform');
    var update_block            = document.getElementById('update-available');

    if (!is_enabled) {
        inform_icon.style.display = 'inline-block';
        controllable_block.style.display = 'none';
        update_block.style.display = 'none';

        return;
    }

    inform_icon.style.display = 'none';

    chrome.runtime.sendMessage({"get": "current_state"}, function (response) {
        update_block.style.display = (response.is_available_update ? 'block' : 'none');
        controllable_block.style.display = (response.is_controllable_settings ? 'none' : 'block');
    });
}

(function($) {

    // Switcher
    $(document).ready(function() {
        $('input').lc_switch();

        var label = document.querySelector('#control .label .status');

        // On
        $('body').delegate('.lcs_check', 'lcs-on', function() {
            chrome.runtime.sendMessage({
                "set" : "is_enabled_proxy",
                "value": true
            }, function () {
                label.innerHTML = 'Плагин включен';
                label.style.color = 'green';
                validateView(true);
            });
        });

        // Off
        $('body').delegate('.lcs_check', 'lcs-off', function() {
            chrome.runtime.sendMessage({
                "set" : "is_enabled_proxy",
                "value": false
            }, function () {
                label.innerHTML = 'Плагин выключен';
                label.style.color = 'red';
                validateView(false);
            });
        });
    });

    // Check and set current switcher state
    chrome.runtime.sendMessage({ "get" : "is_enabled_proxy" }, function(response) {
        if (response.is_enabled_proxy) {
            $('.lcs_check').lcs_on();
        }
        else {
            $('.lcs_check').lcs_off();
        }
    });

    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if ('validate_popup' === request.command) {
            validateView(request.isEnabled)
        }
        sendResponse();
    })


})(jQuery);
