namespace littleware {
    export namespace app511 {

        export interface Contraction {
            startTime: Date;
            endTime: Date;
        }

        export interface Stats {
            avePeriodSecs:number;
            aveDurationSecs:number;
            timeCoveredSecs:number;
            numSamples:number;
        }

        /**
         * Little utility converts a date to the degrees represnting
         * the position of the minute-hand on a clock for the given date
         */
        export function date2Degrees( dt:Date ):number {
            return (dt.getMinutes()*60 + dt.getSeconds()) / 10;
        }

        export function date2Str( dt:Date ):string {
            const hrs = dt.getHours();
            const amPm = (hrs < 12) ? "AM" : "PM";
            return ("" + (hrs === 0 ? 12 : hrs) + ":0" + dt.getMinutes() + ":0" + dt.getSeconds() + " " + amPm).replace( /:0+(\d\d+)/g, ":$1" );
        }

        /**
         * Compute statistics over the given history of contractions -
         * assumes contractions are sorted in time-ascending order.
         */
        export function computeStats( history:Contraction[] ):Stats {
            let count = history.length;
            let result = {
                avePeriodSecs: 0,
                aveDurationSecs:0,
                timeCoveredSecs:0,
                numSamples:count
            };
            if ( count > 1 ) {
                let copy:Contraction[] = [].concat( history );
                result.avePeriodSecs = Math.round(
                    history.slice(1).map( 
                        (it) => { return it.startTime.getTime() - copy.shift().startTime.getTime(); } 
                    ).reduce( (acc,it) => { return acc+it; }, 0 ) / (1000 * (count-1))
                );
            }
            if ( count > 0 ) {
                result.aveDurationSecs = Math.round(
                    history.map( 
                        (it) => { return it.endTime.getTime() - it.startTime.getTime(); }
                    ).reduce( (acc,it) => { return acc + it; }, 0 ) / (1000 * count)
                );
                result.timeCoveredSecs = Math.round( (history[count-1].endTime.getTime() - history[0].startTime.getTime())/1000);
            }
            return result;
        }

        export const storageKey = "511Data";

        export interface View511 {
            pie:HTMLElement;
            historyTable:HTMLElement;
            statsTable:HTMLElement;
            startStopButton:HTMLElement,
            clearHistoryButton:HTMLElement,
            clearHistoryModal:HTMLElement
        };

        /**
         * Manager for the 511 view
         */
        export class Controller511 {
            private _timerInterval:any;
            contractionList:Contraction[];

            view:View511;
            
            constructor( view:View511, contractionList:Contraction[] ) {
                this.contractionList = [];
                this._timerInterval = null;
                this.view = view;
            }

            /**
             * Update the UX to match the current state of the controller
             * 
             * @param includeSecondHand whether or not to render a clock hand at the current second
             */
            render( includeSecondHand:boolean ):void {
                //
                // First - update the pie widget - pie only shows
                // data for contractions that occurred over the last hour
                //
                let nowMs = Date.now();
                let oneHourMs = 60*60*1000;
                let oneHourHistory = this.contractionList.filter(
                    (cxn) => { return nowMs - cxn.startTime.getTime() < oneHourMs }
                );
                let arrivalListStr = oneHourHistory.map(
                    (cxn) => {
                        return {
                            startDegrees: date2Degrees( cxn.startTime ),
                            endDegrees: date2Degrees( cxn.endTime )
                        }
                    }
                ).map(
                    (deg) => {
                        return "" + deg.startDegrees + "," + ((360 + deg.endDegrees - deg.startDegrees) % 360);
                    }
                ).reduce(
                    (acc,s) => { return acc + s + ";" }, ""
                );
                if ( includeSecondHand ) {
                    arrivalListStr += (new Date().getSeconds() * 6) + ",1";
                }
                this.view.pie.setAttribute( "arrival-list", arrivalListStr );

                // update the stats table
                let stats = computeStats( oneHourHistory );
                let statCells = this.view.statsTable.querySelectorAll( 'td' );
                if ( statCells.length > 2 ) {
                    const durMins = Math.floor( stats.avePeriodSecs / 60 );
                    const remainingSecs = stats.avePeriodSecs % 60;
                    statCells[0].textContent = "" + durMins + " mins : " + remainingSecs + " secs";
                    statCells[1].textContent = "" + Math.round( stats.aveDurationSecs ) + " secs";
                    statCells[2].textContent = "" + (Math.round( stats.timeCoveredSecs / 0.6 )/100) + " mins";
                } else {
                    console.log( "ERROR: malformed stats table" );
                }

                // update the history table
                let dataBody = this.view.historyTable.querySelector( 'tbody' );
                while( dataBody.hasChildNodes() ) {
                    dataBody.removeChild( dataBody.childNodes[0] );
                }
                oneHourHistory.reverse().forEach(
                    (cxn, index) => {
                        let tr = document.createElement( "TR" );
                        let tdStart = document.createElement( "TD" );
                        tdStart.innerText = date2Str( cxn.startTime );
                        let tdEnd = document.createElement( "TD" );
                        tdEnd.innerText = date2Str( cxn.endTime );
                        let tdDuration = document.createElement( "TD" );
                        tdDuration.innerText = "" + Math.round((cxn.endTime.getTime() - cxn.startTime.getTime()) / 1000) + " secs";
                        [tdStart,tdEnd,tdDuration].forEach( (td) => { tr.appendChild(td); });
                        dataBody.appendChild(tr);
                    }
                );

                // update the button
                if ( this.isTimerRunning ) {
                    this.view.startStopButton.classList.remove( "lw-button_start" );
                    this.view.startStopButton.classList.add( "lw-button_stop");
                    this.view.startStopButton.textContent = this.view.startStopButton.textContent.replace( "start", "stop" );
                } else {
                    this.view.startStopButton.classList.remove( "lw-button_stop" );
                    this.view.startStopButton.classList.add( "lw-button_start");
                    this.view.startStopButton.textContent = this.view.startStopButton.textContent.replace( "stop", "start" );
                }
            }

            get isTimerRunning() {
                return !! this._timerInterval;
            }

            /**
             * Internal helper updates the endTime on the most recent
             * contraction to now - unless that update would give the latest contraction
             * a duration over 10mins - in which case we auto-add a new Contraction.
             * Also - limits the list to 100 entries.
             * These rules have to do with limitations on our view (pie only supports
             * accute angle slices, and table is only useful up to 100 entries) 
             * 
             * @return the most recent contraction
             */
            _updateLatestContraction():Contraction {
                let now = new Date();

                if( this.contractionList.length < 1 ) {
                    this.contractionList.push(
                        { startTime: now, endTime: now }
                    );
                }
                let cxn = this.contractionList[ this.contractionList.length - 1 ];
                let durationMins = (now.getTime() - cxn.startTime.getTime()) / 60000;
                if ( durationMins < 10 ) {
                    cxn.endTime = new Date();
                } else {
                    // start a new contraction if last duration would be over 10 mins
                    cxn = { startTime:now, endTime:now };
                    this.contractionList.push( cxn );
                }
                // 
                // Limit the contraction list to 100 entries
                //
                if ( this.contractionList.length > 100 ) {
                    this.contractionList.splice( 0, this.contractionList.length - 100 );
                }
                //
                // Persist to local storage
                //
                localStorage.setItem( storageKey, JSON.stringify( { contractionList: this.contractionList } ));
                return cxn;
            }


            /**
             * Add a new contraction to the contractionList, and
             * setup an interval to update that contraction's endTime,
             * and re-render the view.
             */
            startTimer():void {
                if ( ! this._timerInterval ) {
                    let cxn = {
                        startTime: new Date(),
                        endTime: new Date()
                    };
                    this.contractionList.push( cxn );
                    this._timerInterval = setInterval(
                        () => {
                            var nowMs = Date.now();
                            
                            let latest = this._updateLatestContraction();
                            if ( latest !== cxn ) {
                                // assume the user has gone away after 10 mins - need to get to hostpital anyway!
                                this.endTimer();
                            } else {
                                this.render(true);
                            }
                        },
                        500
                    );
                } else {
                    console.log( "ignoring duplicate startTimer call" );
                }
            }

            /**
             * End the timer started by startTimer, and re-render
             * 
             * @return true if timer cleared and render called, false if NOOP
             *          since timer was not running
             */
            endTimer():boolean {
                if ( this._timerInterval ) {
                    clearInterval( this._timerInterval );
                    this._timerInterval = null;
                    this.render(false);
                    return true;
                } else {
                    console.log( "ignoring endTimer call - no active interval" );
                    return false;
                }
            }

            /**
             * Clear the history contraction list, clear the start-timer interval if any,
             * and re-render
             */
            clearHistory():void {
                localStorage.removeItem( storageKey );
                this.contractionList = [];
                this.closeClearHistoryModal();
                if ( ! this.endTimer() ) {
                    this.render( false );
                }
            }

            openClearHistoryModal():void {
                this.view.clearHistoryModal.classList.add( "lw-modalDialog_open" );
            }

            closeClearHistoryModal():void {
                this.view.clearHistoryModal.classList.remove( "lw-modalDialog_open" );
            }
        }
    

        /**
         * Attach a controller to the DOM elements that make up the 511 UX
         */
        export function attachController( 
            view:View511
            ):any {
            let contractionList = [];
            try {
                let data = JSON.parse( localStorage.getItem( storageKey ) );
                contractionList = data.contractionList || [];
            } catch ( err ) {
                console.log( "Failed parsing 511 local storage", err );
            }
            
            let controller = new Controller511( view, contractionList );
            view.startStopButton.addEventListener( "click", function(ev) {
                if ( controller.isTimerRunning ) {
                    controller.endTimer();
                } else {
                    controller.startTimer();
                }
            });

            view.clearHistoryButton.addEventListener( "click", function(ev) {
                controller.openClearHistoryModal();
            });
            const closeX = view.clearHistoryModal.querySelector( "a.lw-modalDialog__closeX" );
            if ( closeX ) {
                closeX.addEventListener( "click", function(ev) {
                    controller.closeClearHistoryModal();
                });
            } else {
                console.log( "WARNING - no 'closeX' link found in clearHistory modal" );
            }
            const okButton = view.clearHistoryModal.querySelector( "button" );
            if ( okButton ) {
                okButton.addEventListener( "click", function(ev) {
                    controller.clearHistory();
                });
            } else {
                console.log( "WARNING - no 'ok' button found in clearHistory modal" );
            }
            return controller;
        }

    }
}