'use strict';

var Convert = (function () {
    var processorMap = {
        'doc': processDoc,
        'assembly': processAssembly,
        'members': processMembers,
        'member': processMember,
        'summary': processSummary,
        'remarks': processRemarks,
        'param': processParam,
        'returns': processReturns,
        'exception': processException,
        'see': processSee,
        'c': processC,
        '#text': processText
    };
    
    return {
        markdownToHtml: function (markdown) {
            return marked(markdown);
        },

        vsdocToMarkdown: function (vsdoc) {
            var xml = new DOMParser().parseFromString(vsdoc, 'text/xml');
            var ctx = {
                markdown: [], // Output will be appended here.
                paramTypes: {}
            };
            
            processChildren(ctx, xml);
            return ctx.markdown.join('');
        }
    }
    
    /* Process pass */

    function processChildren(ctx, node) {
        for (var i = 0; i < node.childNodes.length; i++) {
            var childNode = node.childNodes[i];
            var processor = processorMap[childNode.nodeName];
            if (processor) processor(ctx, childNode);
        }
    }

    function processDoc(ctx, docNode) {
        processChildren(ctx, docNode);
        ctx.lastNode = 'doc';
    }
    
    function processAssembly(ctx, assemblyNode) {
        var assemblyNameNode = assemblyNode.children[0];
        ctx.assembly = assemblyNameNode.textContent;
        
        ctx.markdown.push('\n# ');
        ctx.markdown.push(ctx.assembly);
        ctx.markdown.push('\n\n');
        
        ctx.lastNode = 'assembly';
    }

    function processMembers(ctx, membersNode) {
        // 1. Extract type and name from members.
        var childNodes = [];
        for (var i = 0; i < membersNode.children.length; i++) {
            var childNode = membersNode.children[i];
            var childName = childNode.getAttribute('name');
            childNode.type = childName.substring(0, 1);
            childNode.name = childName.substring(2);
            childNodes.push(childNode);
        }
        
        // 2. Sort members by their name.                
        childNodes.sort(function (a, b) { 
            return a.name.localeCompare(b.name); 
        });
        
        // 3. Process members.
        for (var i = 0; i < childNodes.length; i++) {
            processMember(ctx, childNodes[i]);
        }
        
        ctx.lastNode = 'members';
    }

    function processMember(ctx, memberNode) {
        var type = memberNode.type;
        var name = memberNode.name;        
        
        if (type === 'T') {
            ctx.namespace = name.substring(0, name.lastIndexOf('.'));
            name = name.replace(ctx.namespace + '.', '');
            ctx.typeName = name;
            
            ctx.markdown.push('\n## ');
            ctx.markdown.push(name);
            ctx.markdown.push('\n\n');
        } else { 
            if (type === 'M') {
                name = rearrangeParametersInContext(ctx, memberNode);
            }
                 
            name = name.replace(ctx.namespace + '.' + ctx.typeName + '.', '');      
            if (name.indexOf('#ctor') >= 0) {
                name = name.replace('#ctor', 'Constructor');
            }
            ctx.markdown.push('\n### ');
            ctx.markdown.push(name);
            ctx.markdown.push('\n\n');
        }
        
        processChildren(ctx, memberNode);        

        ctx.lastNode = 'member';
    }

    function processSummary(ctx, summaryNode) {        
        processChildren(ctx, summaryNode);
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
        var paramType = ctx.paramTypes[paramName];
        if (paramType) {
            ctx.markdown.push(paramType);
        } else {
            ctx.markdown.push('Unknown type')
        }
        ctx.markdown.push('* <br>');
        ctx.markdown.push(paramNode.textContent);
        ctx.markdown.push(' |\n');
        
        ctx.lastNode = 'param';
    }

    function processReturns(ctx, returnsNode) {
        var returns = returnsNode.textContent;
        returns = returns.replace('/\s+/', ' ');
        
        ctx.markdown.push('\n#### Returns\n\n');
        ctx.markdown.push(returns);
        ctx.markdown.push('\n\n');
        
        ctx.lastNode = 'returns';
    }

    function processRemarks(ctx, remarksNode) {
        var remarks = remarksNode.textContent;
        remarks = remarks.replace('/\s+/', ' ');
        
        ctx.markdown.push('\n#### Remarks\n\n');
        ctx.markdown.push(remarks);
        ctx.markdown.push('\n\n');
        
        ctx.lastNode = 'remarks';
    }

    function processException(ctx, exceptionNode) {
        var exName = exceptionNode.getAttribute('cref').substring(2);
        var ex = exceptionNode.textContent.replace(/\s+/, ' ');
        
        ctx.markdown.push('*');
        ctx.markdown.push(exName);
        ctx.markdown.push(':* ');
        ctx.markdown.push(ex);
        ctx.markdown.push('\n\n');
        
        ctx.lastNode = 'exception';
    }
    
    function processSee(ctx, seeNode) {
        ctx.markdown.push(seeNode.getAttribute('cref'));
        ctx.lastNode = 'see';
    }
    
    function processC(ctx, cNode) {
        ctx.markdown.push('`');
        ctx.markdown.push(cNode.textContent);
        ctx.markdown.push('`');
        ctx.lastNode = 'c';
    }
    
    function processText(ctx, textNode) {
        ctx.markdown.push(textNode.nodeValue.replace(/\s+/, ' '));
        ctx.lastNode = '#text';
    }

    /* Process pass ends here */

    function rearrangeParametersInContext(ctx, memberNode) {
        var methodPrototype = memberNode.name;
        var matches = methodPrototype.match(/\((.*)\)/);
        if (!matches) {
            return methodPrototype;
        }        
                
        var paramString = matches[1].replace(' ', '');
        var paramTypes = paramString.split(',');
        if (paramTypes.length === 0) {
            return methodPrototype;
        }
        
        var paramNodes = [];
        for (var i = 0; i < memberNode.children.length; i++) {
            var childNode = memberNode.children[i];
            if (childNode.nodeName === 'param') {
                paramNodes.push(childNode);
            }
        }        
        if (paramNodes.length === 0) {
            return methodPrototype;
        }
        
        var newParamString = '';
        for (var i = 0; i < paramNodes.length; i++) {
            var paramNode = paramNodes[i];
            var paramName = paramNode.getAttribute('name');
            var paramType = paramTypes[i];
            newParamString += newParamString ? ', ' : '';
            newParamString += paramName;
            ctx.paramTypes[paramName] = paramType;
        }
        
        var newMethodPrototype = methodPrototype.replace(/\(.*\)/, '(' + newParamString + ')');
        return newMethodPrototype;
    }
})();