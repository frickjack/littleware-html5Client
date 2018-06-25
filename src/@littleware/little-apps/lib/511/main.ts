import {attachController} from './511.js';
import '../headerSimple/headerSimple.js';

document.addEventListener('DOMContentLoaded', function(event) {
    const testController = attachController(
        {
            pie: document.body.querySelector('lw-arrival-pie'),
            historyTable: document.body.querySelector('table#history'),
            statsTable: document.body.querySelector('table#stats'),
            startStopButton: document.body.querySelector('button#startStop'),
            clearHistoryButton: document.body.querySelector('button#clearHistory'),
            clearHistoryModal: document.body.querySelector('div#clearHistoryModal')
        }
   );
});
