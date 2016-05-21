'use strict';

var Convert = (function () {
    /* Preprocess pass */

    function preprocessDoc(ctx, doc) {
        doc.members = doc.members || [];
        preprocessMembers(ctx, doc.members);
    }

    function preprocessMembers(ctx, members) {
        for (var i = 0; i < members.length; i++) {
            var member = members[i];
            member.type = member.name.substring(0, 1);
            member.shortName = member.name.substring(2);
            if (member.shortName === '#ctor') {
                member.shortName = 'Constructor';
            }
        }
    }

    /* Preprocess pass ends here */
    /* Process pass */

    function processDoc(ctx, docNode) {
        var assembly = docNode.children[0];
        var assemblyName = assembly.children[0];
        var members = docNode.children[1];

        ctx.assembly = assemblyName.innerHTML; // /assembly/name/:text
        ctx.namespace = ctx.assembly;
        // var typeMemberNames = doc.members
        //     .filter(function (member) { return member.type === 'T' })
        //     .map(function (typeMember) { return typeMember.shortName });
        // if (typeMemberNames.length >= 2) {
        //     var prefix = sharedStart([typeMemberNames[0], typeMemberNames[1]]);
        //     // Remove the dot suffix.
        //     ctx.namespace = prefix.substring(0, prefix.length - 1);
        // }

        console.log(ctx.assembly);
        console.log(ctx.namespace);

        ctx.markdown.push('\n# ');
        ctx.markdown.push(ctx.assembly);
        ctx.markdown.push('\n\n');
        processMembers(ctx, members);
        ctx.lastNode = 'doc';
    }

    function processMembers(ctx, membersNode) {
        // members.sort(function (a, b) { return a.shortName.localeCompare(b.shortName); });
        for (var i = 0; i < membersNode.children.length; i++) {
            processMember(ctx, membersNode.children[i]);
        }
        ctx.lastNode = 'members';
    }

    var processorMap = {
        'summary': processSummary,
        'remarks': processRemarks,
        'param': processParam,
        'returns': processReturns,
        'exception': processException
    };
    function processMember(ctx, memberNode) {
        var name = memberNode.getAttribute('name');
        var type = name.substring(0, 1);
        var shortName = name.substring(2, name.length);

        if (type === 'M') {
            rearrangeParametersInContext(ctx, memberNode);
        } 
        
        if (type === 'T') {
            ctx.markdown.push('\n## ');
            ctx.markdown.push(shortName);
            ctx.markdown.push('\n\n');
        } else {
            if (shortName.startsWith('#ctor')) {
                shortName = 'Constructor';
            }
            ctx.markdown.push('\n### ');
            ctx.markdown.push(shortName);
            ctx.markdown.push('\n\n');
        }
        
        for (var i = 0; i < memberNode.children.length; i++) {
            var child = memberNode.children[i];
            var processor = processorMap[child.nodeName];
            if (processor) processor(ctx, child);            
        }

        ctx.lastNode = 'member';
    }

    function processSummary(ctx, summaryNode) {
        var summary = summaryNode.innerHTML;
        summary = summary.replace(/\s+/, ' ').trim();
        ctx.markdown.push(summary);
        ctx.markdown.push('\n\n');
        ctx.lastNode = 'summary';
    }

    function processParam(ctx, paramNode) {
        if (ctx.lastNode !== 'param') {
            ctx.markdown.push('| Name | Description |\n');
            ctx.markdown.push('| ---- | ----------- |\n');
        }
        var paramName = paramNode.getAttribute('name');
        ctx.markdown.push('| ');
        ctx.markdown.push(paramName);
        ctx.markdown.push(' | *');
        ctx.markdown.push('TYPE');
        ctx.markdown.push('*<br>');
        ctx.markdown.push(paramNode.innerHTML);
        ctx.markdown.push(' |\n');
        
        ctx.lastNode = 'param';
    }

    function processReturns(ctx, returnsNode) {
        var returns = returnsNode.innerHTML;
        returns = returns.replace('/\s+/', ' ');
        
        ctx.markdown.push('\n#### Returns\n\n');
        ctx.markdown.push(returns);
        ctx.markdown.push('\n\n');
        
        ctx.lastNode = 'returns';
    }

    function processRemarks(ctx, remarksNode) {
        var remarks = remarksNode.innerHTML;
        remarks = remarks.replace('/\s+/', ' ');
        
        ctx.markdown.push('\n#### Remarks\n\n');
        ctx.markdown.push(remarks);
        ctx.markdown.push('\n\n');
        
        ctx.lastNode = 'remarks';
    }

    function processException(ctx, exceptionNode) {
        var exName = exceptionNode.getAttribute('cref').substring(2);
        var ex = exceptionNode.innerHTML.replace(/\s+/, ' ');
        
        ctx.markdown.push('*');
        ctx.markdown.push(exName);
        ctx.markdown.push(':* ');
        ctx.markdown.push(ex);
        ctx.markdown.push('\n\n');
        
        ctx.lastNode = 'exception';
    }

    /* Process pass ends here */

    function rearrangeParametersInContext(context, member) {

    }

    // Ref: http://stackoverflow.com/a/1917041/1466456
    function sharedStart(array) {
        console.log(array);
        var A = array.concat().sort(),
            a1 = A[0], a2 = A[A.length - 1], L = a1.length, i = 0;
        while (i < L && a1.charAt(i) === a2.charAt(i)) i++;
        return a1.substring(0, i);
    }

    return {
        markdownToHtml: function (markdown) {
            return marked(markdown);
        },

        vsdocToMarkdown: function (vsdoc) {
            var xml = new DOMParser().parseFromString(vsdoc, 'text/xml');

            var doc = xml.children[0];

            var ctx = {
                markdown: [] // Output will be appended here.
            };
            // preprocessDoc(ctx, doc);
            processDoc(ctx, doc);

            return ctx.markdown.join('');
        }
    }
})();