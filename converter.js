'use strict';

var Converter = {
    vsdocToMarkdown: function(vsdoc) {
        return vsdoc;
    },
    
    markdownToHtml: function(markdown) {
        return marked(markdown);
    }
};