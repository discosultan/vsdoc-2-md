'use strict';

var Convert = (function () {
    var processorMap = {
        'doc': processDoc,
        'assembly': processAssembly,
        'name': processName,
        'members': processMembers,
        'member': processMember,
        'summary': processSummary,
        'remarks': processRemarks,
        'param': processParam,
        'returns': processReturns,
        'exception': processException,
        'see': processSee,
        'seealso': processSee,
        'c': processC,
        '#text': processText
    };
    
    return {
        markdownToHtml: function (markdown) {
            return marked(markdown);
        },

        vsdocToMarkdown: function (vsdoc) {
            var parser = new DOMParser();
            var xml = parser.parseFromString(vsdoc, 'text/xml');
            var ctx = {                
                markdown: [], // Output will be appended here.
                paramTypes: {}
            };
            
            processChildren(ctx, xml);
            return ctx.markdown.join('');
        }
    };
    
    /* Process pass */

    function processChildren(ctx, node) {
        // if (node.nodeType === Node.ELEMENT_NODE) {
        //     node.innerHTML = node.innerHTML.trim();
        // }
        for (var i = 0; i < node.childNodes.length; i++) {
            ctx.first = i === 0;
            ctx.last = i === node.childNodes.length;
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
        ctx.markdown.push('# ');
        processChildren(ctx, assemblyNode);        
        ctx.markdown.push('\n\n');
        
        ctx.lastNode = 'assembly';
    }

    function processName(ctx, nameNode) {
        ctx.markdown.push(nameNode.textContent);
                
        ctx.lastNode = 'name';
    }

    function processMembers(ctx, membersNode) {
        // 1. Extract type and name from members.
        var childElements = [];
        for (var i = 0; i < membersNode.childNodes.length; i++) {
            var childNode = membersNode.childNodes[i];
            if (childNode.nodeType === Node.ELEMENT_NODE) {
                var childName = childNode.getAttribute('name');
                childNode.type = childName.substring(0, 1);
                childNode.name = childName.substring(2);
                childElements.push(childNode);
            }
        }
        
        // 2. Sort members by their name.                
        childElements.sort(function (a, b) { 
            return a.name.localeCompare(b.name); 
        });
        
        // 3. Process members.
        for (var i = 0; i < childElements.length; i++) {
            processMember(ctx, childElements[i]);
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
        ctx.lastMemberElement = undefined;
    }

    function processSummary(ctx, summaryNode) {                
        processChildren(ctx, summaryNode);
        ctx.markdown.push('\n\n');
        
        ctx.lastNode = 'summary';
        ctx.lastMemberElement = ctx.lastNode;
    }

    function processParam(ctx, paramNode) {
        if (ctx.lastMemberElement !== 'param') {
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
            ctx.markdown.push('Unknown type');
        }
        ctx.markdown.push('*<br>');
        processChildren(ctx, paramNode);        
        ctx.markdown.push(' |\n');
        
        ctx.lastNode = 'param';
        ctx.lastMemberElement = ctx.lastNode;
    }

    function processReturns(ctx, returnsNode) {
        ctx.markdown.push('\n#### Returns\n\n');        
        processChildren(ctx, returnsNode);
        ctx.markdown.push('\n\n');
        
        ctx.lastNode = 'returns';
        ctx.lastMemberElement = ctx.lastNode;
    }

    function processRemarks(ctx, remarksNode) {
        ctx.markdown.push('\n#### Remarks\n\n');        
        processChildren(ctx, remarksNode);
        ctx.markdown.push('\n\n');
        
        ctx.lastNode = 'remarks';
        ctx.lastMemberElement = ctx.lastNode;
    }

    function processException(ctx, exceptionNode) {
        var cref = exceptionNode.getAttribute('cref');
        if (cref) {
            var exName = cref.substring(2);
            exName = exName.substring(exName.lastIndexOf('.') + 1);
            
            ctx.markdown.push('*');
            ctx.markdown.push(exName);
            ctx.markdown.push(':* ');        
            processChildren(ctx, exceptionNode);
            ctx.markdown.push('\n\n');
        }
        
        ctx.lastNode = 'exception';
        ctx.lastMemberElement = ctx.lastNode;
    }
    
    function processSee(ctx, seeNode) {
        var cref = seeNode.getAttribute('cref'); // For example: T:System.String        
        if (cref) { 
            var typeName = cref.substring(2);
            typeName = typeName.substring(typeName.lastIndexOf('.') + 1);
            ctx.markdown.push('<a href="#');
            ctx.markdown.push(typeName.toLowerCase());
            ctx.markdown.push('">')
            ctx.markdown.push(typeName);
            ctx.markdown.push('</a>');            
        } else {
            var href = seeNode.getAttribute('href'); // For example: http://stackoverflow.com/
            if (href) {                                
                ctx.markdown.push('<a href="');
                ctx.markdown.push(href);
                ctx.markdown.push('">')
                ctx.markdown.push(href);
                ctx.markdown.push('</a>');
            }     
        }
        
        ctx.lastNode = 'see';
    }
    
    function processC(ctx, cNode) {
        ctx.markdown.push('`');
        ctx.markdown.push(cNode.textContent);
        ctx.markdown.push('`');
        
        ctx.lastNode = 'c';
    }
    
    function processText(ctx, textNode) {
        if (ctx.first) {
            textNode.nodeValue = trimStart(textNode.nodeValue);
        }
        if (ctx.last) {
            textNode.nodeValue = trimEnd(textNode.nodeValue);
        }
        
        // Append text only if it contains any characters other than whitespace.
        if (textNode.nodeValue.trim().length > 0) {            
            ctx.markdown.push(textNode.nodeValue.replace(/\s+/g, ' '));
        }
        
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
        for (var i = 0; i < memberNode.childNodes.length; i++) {
            var childNode = memberNode.childNodes[i];
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
    
    function trimStart(value) {
        return value.replace(/^\s+/, '');
    }
    
    function trimEnd(value) {
        return value.replace(/\s+$/, '');
    }
})();