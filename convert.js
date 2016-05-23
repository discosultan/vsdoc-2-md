'use strict';

var Convert = (function () {
    
    // Supported tags are taken from https://msdn.microsoft.com/en-us/library/5ast78ax.aspx
    // Note that <include> and <inheritdoc> tags are not supported!
    var processorMap = {
        'doc': processDoc,
        'assembly': processAssembly,        
        'members': processMembers,
        'member': processMember,
        'summary': processSummary,
        'value': processValue,
        'typeparam': processTypeparam,
        'remarks': processRemarks,
        'para': processPara,
        'param': processParam,
        'returns': processReturns,
        'example': processExample,
        'permission': processPermission,
        'exception': processException,
        'list': processList,
        'paramref': processParamref,
        'typeparamref': processTypeparamref,
        'see': processSee,
        'seealso': processSeealso,
        'c': processC,
        'code': processCode,
        '#text': processText
    };
    
    return {
        markdownToHtml: function (markdown) {
            // We use a vendor provided markdown to html parser called marked.
            // Ref: https://github.com/chjj/marked
            return marked(markdown);
        },

        vsdocToMarkdown: function (vsdoc) {
            var parser = new DOMParser();
            var xml = parser.parseFromString(vsdoc, 'text/xml');
            var ctx = {                
                markdown: [], // Output will be appended here.
                paramTypes: {},
                nodeStack: []
            };
            
            process(ctx, xml);
            return ctx.markdown.join('');
        }
    };
    
    /* Process pass */

    function process(ctx, node) {        
        for (var i = 0; i < node.childNodes.length; i++) {
            ctx.first = i === 0;
            ctx.last = i === node.childNodes.length;
            var childNode = node.childNodes[i];
            
            ctx.nodeStack.push(childNode.nodeName);
            var processor = processorMap[childNode.nodeName];
            if (processor) processor(ctx, childNode);
            ctx.nodeStack.pop();
        }
    }

    function processDoc(ctx, docNode) {
        process(ctx, docNode);        
        ctx.lastNode = 'doc';
    }
    
    function processAssembly(ctx, assemblyNode) {
        var nameNode = findChildNode(assemblyNode, 'name');
        ctx.markdown.push('# ');        
        ctx.markdown.push(nameNode.textContent);        
        ctx.lastNode = 'assembly';
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
        
        // 3. Append sorted nodes back to their parent.
        for (var i = 0; i < childElements.length; i++) {
            membersNode.appendChild(childElements[i]);            
        }
        
        process(ctx, membersNode);        
        ctx.lastNode = 'members';
    }

    function processMember(ctx, memberNode) {
        var type = memberNode.type;
        var name = memberNode.name;        
        
        if (type === 'T') {
            ctx.namespace = name.substring(0, name.lastIndexOf('.'));
            name = name.replace(ctx.namespace + '.', '');
            ctx.typeName = name;
            
            ctx.markdown.push('\n\n\n## ');                
            ctx.markdown.push(name);
        } else { 
            if (type === 'M') {
                name = rearrangeParametersInContext(ctx, memberNode);
            }                 
            name = name.replace(ctx.namespace + '.' + ctx.typeName + '.', '');      
            if (name.indexOf('#ctor') >= 0) {
                name = name.replace('#ctor', 'Constructor');
            }
            
            ctx.markdown.push('\n\n### ');
            ctx.markdown.push(name);
        }
        
        process(ctx, memberNode);

        ctx.lastNode = 'member';
        ctx.lastMemberElement = undefined;
    }

    function processSummary(ctx, summaryNode) {
        process(ctx, summaryNode);
        
        ctx.lastNode = 'summary';
        ctx.lastMemberElement = ctx.lastNode;
    }
    
    function processValue(ctx, valueNode) {
        ctx.markdown.push('\n\n#### Value');
        process(ctx, valueNode);
        
        ctx.lastNode = 'value';
        ctx.lastMemberElement = ctx.lastNode;
    }
    
    function processTypeparam(ctx, typeparamNode) {
        var name = typeparamNode.getAttribute('name');
        if (name) {
            if (ctx.lastMemberElement !== 'typeparam') {
                ctx.markdown.push('\n####Type Parameters\n');            
            }            
            ctx.markdown.push('\n- ');
            ctx.markdown.push(name);
            ctx.markdown.push(' - ');
            process(ctx, typeparamNode);
            
            ctx.lastNode = 'typeparam';
            ctx.lastMemberElement = ctx.lastNode;
        }
    }

    function processParam(ctx, paramNode) {
        var paramName = paramNode.getAttribute('name');
        var paramType = ctx.paramTypes[paramName];
        
        if (ctx.lastMemberElement !== 'param') {
            ctx.markdown.push('\n\n| Name | Description |\n');
            ctx.markdown.push('| ---- | ----------- |');
        }        
        ctx.markdown.push('\n| ');
        ctx.markdown.push(paramName);
        ctx.markdown.push(' | *');        
        if (paramType) {
            ctx.markdown.push(paramType);
        } else {
            ctx.markdown.push('Unknown type');
        }
        ctx.markdown.push('*<br>');
        process(ctx, paramNode);        
        ctx.markdown.push(' |');
        
        ctx.lastNode = 'param';
        ctx.lastMemberElement = ctx.lastNode;
    }

    function processReturns(ctx, returnsNode) {
        ctx.markdown.push('\n\n#### Returns');        
        process(ctx, returnsNode);
                
        ctx.lastNode = 'returns';
        ctx.lastMemberElement = ctx.lastNode;
    }

    function processRemarks(ctx, remarksNode) {
        ctx.markdown.push('\n\n#### Remarks');        
        process(ctx, remarksNode);
        
        ctx.lastNode = 'remarks';
        ctx.lastMemberElement = ctx.lastNode;
    }

    function processExample(ctx, exampleNode) {
        ctx.markdown.push('\n\n#### Example');
        process(ctx, exampleNode);
        
        ctx.lastNode = 'example';
        ctx.lastMemberElement = ctx.lastNode;
    }
    
    function processPermission(ctx, permissionNode) {
        var cref = permissionNode.getAttribute('cref');        
        if (cref) {
            if (ctx.lastMemberElement !== 'permission') {        
                ctx.markdown.push('\n\n#### Permissions\n');
            }
            
            ctx.markdown.push('\n- ');
            ctx.markdown.push(cref);
            ctx.markdown.push(': ')
            process(ctx, permissionNode);
            
            ctx.lastNode = 'permission';
            ctx.lastMemberElement = ctx.lastNode;
        }
    }

    function processException(ctx, exceptionNode) {
        var cref = exceptionNode.getAttribute('cref');
        if (cref) {
            var exName = cref.substring(2);
            exName = exName.replace(ctx.namespace + '.', '');
            
            ctx.markdown.push('\n\n*');
            ctx.markdown.push(exName);
            ctx.markdown.push(':* ');        
            process(ctx, exceptionNode);
            
            ctx.lastNode = 'exception';
            ctx.lastMemberElement = ctx.lastNode;
        }                
    }
    
    function processList(ctx, listNode) {
        var type = listNode.getAttribute('type');
        var newline = (ctx.nodeStack[ctx.nodeStack.length - 2] === 'param') ? '<br>' : '\n'; 
        if (type) {
            ctx.markdown.push(newline);            
            if (type === 'table') {
                var listheaderElement = findChildNode(listNode, 'listheader');
                var listheaderTermElements = findChildNodes(listheaderElement, 'term')
                ctx.markdown.push('| ');
                for (var i = 0; i < listheaderTermElements.length; i++) {
                    ctx.markdown.push(listheaderTermElements[i].textContent);
                    ctx.markdown.push(' | ');
                }
                ctx.markdown.push(newline);
                
                itemElements = findChildNodes(listNode, 'item');
                for (var i = 0; i < itemElements.length; i++) {
                    var itemTermElements = findChildNodes(itemElements[i], 'term');
                    ctx.markdown.push('| ');
                    for (var j = 0; j < itemTermElements.length; j++) {
                        process(ctx, itemTermElements[j])                        
                        ctx.markdown.push(' | ');
                    }
                    ctx.markdown.push(newline);
                }                
            } else {
                var prefixFn; 
                if (type === 'number') {
                    var counter = 1;
                    prefixFn = function() { return counter++ + '. '; };                    
                } else { // Bullet.                    
                    prefixFn = function() { return '- '; };
                }
                var itemElements = findChildNodes(listNode, 'item');
                for (var i = 0; i < itemElements.length; i++) {
                    var itemElement = itemElements[i];
                    ctx.markdown.push(prefixFn());                    
                    var termElement = findChildNode(itemElement, 'term');
                    if (termElement) {
                        process(ctx, termElement);
                        ctx.markdown.push(' - ');
                    }
                    var descriptionElement = findChildNode(itemElement, 'description');
                    if (descriptionElement) {
                        process(ctx, descriptionElement);
                    }
                    ctx.markdown.push(newline);
                }                
            }            
            ctx.lastNode = 'list';            
        }
    }
    
    function processParamref(ctx, paramrefNode) {
        var name = paramrefNode.getAttribute('name');
        if (name) {
            ctx.markdown.push(name);            
            ctx.lastNode = 'paramref';
        }                
    }
    
    function processTypeparamref(ctx, typeparamrefNode) {
        var name = typeparamrefNode.getAttribute('name');
        if (name) {
            ctx.markdown.push(name);            
            ctx.lastNode = 'typeparamref';
        }                
    }    
    
    function processSee(ctx, seeNode) {
        var cref = seeNode.getAttribute('cref'); // For example: T:System.String        
        if (cref) { 
            var typeName = cref.substring(2);            
            typeName = typeName.replace(ctx.namespace + '.', '');
            ctx.markdown.push('<a href="#');
            ctx.markdown.push(typeName.toLowerCase());
            ctx.markdown.push('">')
            ctx.markdown.push(typeName);
            ctx.markdown.push('</a>');     
            
            ctx.lastNode = 'see';       
        } else {
            var href = seeNode.getAttribute('href'); // For example: http://stackoverflow.com/
            if (href) {                                
                ctx.markdown.push('<a href="');
                ctx.markdown.push(href);
                ctx.markdown.push('">')
                ctx.markdown.push(href);
                ctx.markdown.push('</a>');
                
                ctx.lastNode = 'see';
            }     
        }                
    }
    
    function processSeealso(ctx, seealsoNode) {
        if (ctx.lastMemberElement !== 'seealso') {        
            ctx.markdown.push('\n#### See also\n');
        }
        ctx.markdown.push('\n- ');
        processSee(ctx, seealsoNode);
        
        ctx.lastNode = 'seealso';
        ctx.lastMemberElement = ctx.lastNode;
    }
    
    function processC(ctx, cNode) {
        ctx.markdown.push('`');
        ctx.markdown.push(cNode.textContent);
        ctx.markdown.push('`');
        
        ctx.lastNode = 'c';
    }
    
    function processCode(ctx, codeNode) {
        ctx.markdown.push('\n\n```\n');
        ctx.markdown.push(codeNode.textContent);
        ctx.markdown.push('\n```');
        
        ctx.lastNode = 'code';
    }
    
    function processText(ctx, textNode) {
        // Append text only if it contains any characters other than whitespace.
        if (textNode.nodeValue.trim().length > 0) {
            if (ctx.first || ctx.lastNode === 'list' || ctx.lastNode === 'code') {
                textNode.nodeValue = trimStart(textNode.nodeValue);
            }
            if (ctx.last) {
                textNode.nodeValue = trimEnd(textNode.nodeValue);
            }
            
            // Don't prefix with newline after inline elements.
            if (ctx.lastNode !== 'c' && 
                ctx.lastNode !== 'see' && 
                ctx.lastNode !== 'paramref' && 
                ctx.lastNode !== 'typeparamref' && 
                ctx.lastNode !== '#text' &&
                ctx.nodeStack[ctx.nodeStack.length - 2] !== 'param') { // Param is rendered as a table and uses <br> instead.
                    
                ctx.markdown.push('\n\n');
            }                        
            ctx.markdown.push(textNode.nodeValue.replace(/\s+/g, ' '));            
            ctx.lastNode = '#text';
        }                
    }
    
    function processPara(ctx, paraNode) {        
        process(ctx, paraNode);
        ctx.lastNode = 'para';
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
    
    function findChildNode(node, nodeName) {
        var childNodes = findChildNodes(node, nodeName);
        return childNodes ? childNodes[0] : undefined;
    }
    
    function findChildNodes(node, nodeName) {
        var result = [];
        if (node) {
            for (var i = 0; i < node.childNodes.length; i++) {
                var childNode = node.childNodes[i];
                if (childNode.nodeName === nodeName) {
                    result = result || [];
                    result.push(childNode);   
                }            
            }
        }
        return result;
    }
})();