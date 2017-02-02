namespace littleware {
    export namespace test {
        /**
         * Get a stage (HTML <section>) where a test can manipulate DOM.  If id is supplied,
         * then return the previously created section with the given id attribute if any -
         * otherwise assign the id to the new stage.
         * 
         * @param id optional id to retrieve if present - or assign to new stage
         * @param title optional title (and heading) to attach to a new stage
         * @return HTMLSection
         */
        export function getStage( id?:string, title?:string ):Element {
            let section = id ? document.body.querySelector( 'section[id="' + id + '"]' ) : null;
            if ( section ) {
                return section;
            }
            section = document.createElement( "section" );
            if ( id ) { section.setAttribute( "id", id ); }
            if ( title ) { 
                section.setAttribute( "title", title ); 
                let heading = document.createElement( "h2" ) as HTMLHeadingElement;
                heading.textContent = title;
                section.appendChild( heading );
            }
            // Place stages before the Jasmin reporting area if present - otherwise append to body
            let jreport = document.body.querySelector( 'div[class="jasmine_html-reporter"]');
            if ( jreport ) {
                jreport.parentNode.insertBefore( section, jreport );
            } else {
                document.body.appendChild( section );
            }
            return section;
        }
    }
}