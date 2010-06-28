/*
Copyright (c) 2003-2010, CKSource - Frederico Knabben. All rights reserved.
For licensing, see LICENSE.html or http://ckeditor.com/license

Based on the CKEditor Flash plugin, adapted for streaming video resources and
with flowplayer ( www.flowplayer.org ). Also added resulotion ratiolock and revert
from the image plugin.

For more info regarding set-up and installation see README file, for legal info
see LICENSE.

Kristof Keppens
2010
*/

(function()
{
    /*
     * It is possible to set things in three different places.
     * 1. As attributes in the object tag.
     * 2. As param tags under the object tag.
     * 3. As attributes in the embed tag.
     * It is possible for a single attribute to be present in more than one place.
     * So let's define a mapping between a sementic attribute and its syntactic
     * equivalents.
     * Then we'll set and retrieve attribute values according to the mapping,
     * instead of having to check and set each syntactic attribute every time.
     *
     * Reference: http://kb.adobe.com/selfservice/viewContent.do?externalId=tn_12701
     */
    var ATTRTYPE_OBJECT = 1,
        ATTRTYPE_PARAM = 2,
        ATTRTYPE_EMBED = 4,
	regexGetSize = /^\s*(\d+)((px)|\%)?\s*$/i;

    var attributesMap =
    {
        id : [ { type : ATTRTYPE_OBJECT, name :  'id' } ],
        classid : [ { type : ATTRTYPE_OBJECT, name : 'classid' } ],
        codebase : [ { type : ATTRTYPE_OBJECT, name : 'codebase'} ],
        pluginspage : [ { type : ATTRTYPE_EMBED, name : 'pluginspage' } ],
        src : [ { type : ATTRTYPE_PARAM, name : 'movie' }, { type : ATTRTYPE_EMBED, name : 'src' } ],
        name : [ { type : ATTRTYPE_EMBED, name : 'name' } ],
        align : [ { type : ATTRTYPE_OBJECT, name : 'align' } ],
        title : [ { type : ATTRTYPE_OBJECT, name : 'title' }, { type : ATTRTYPE_EMBED, name : 'title' } ],
        'class' : [ { type : ATTRTYPE_OBJECT, name : 'class' }, { type : ATTRTYPE_EMBED, name : 'class'} ],
        width : [ { type : ATTRTYPE_OBJECT, name : 'width' }, { type : ATTRTYPE_EMBED, name : 'width' } ],
        height : [ { type : ATTRTYPE_OBJECT, name : 'height' }, { type : ATTRTYPE_EMBED, name : 'height' } ],
        hSpace : [ { type : ATTRTYPE_OBJECT, name : 'hSpace' }, { type : ATTRTYPE_EMBED, name : 'hSpace' } ],
        vSpace : [ { type : ATTRTYPE_OBJECT, name : 'vSpace' }, { type : ATTRTYPE_EMBED, name : 'vSpace' } ],
        style : [ { type : ATTRTYPE_OBJECT, name : 'style' }, { type : ATTRTYPE_EMBED, name : 'style' } ],
        type : [ { type : ATTRTYPE_EMBED, name : 'type' } ]
    };

    var names = [ 'play', 'loop', 'menu', 'quality', 'scale', 'salign', 'wmode', 'bgcolor', 'base', 'flashvars', 'allowscriptaccess',
        'allowfullscreen' ];
    for ( var i = 0 ; i < names.length ; i++ )
        attributesMap[ names[i] ] = [ { type : ATTRTYPE_EMBED, name : names[i] }, { type : ATTRTYPE_PARAM, name : names[i] } ];
    names = [ 'allowfullscreen', 'play', 'loop', 'menu' ];
    for ( i = 0 ; i < names.length ; i++ )
        attributesMap[ names[i] ][0]['default'] = attributesMap[ names[i] ][1]['default'] = true;

    var onSizeChange = function()
	{
		var value = this.getValue(),	// This = input element.
			dialog = this.getDialog(),
			aMatch  =  value.match( regexGetSize );	// Check value
		if ( aMatch )
		{
			if ( aMatch[2] == '%' )			// % is allowed - > unlock ratio.
				switchLockRatio( dialog, false );	// Unlock.
			value = aMatch[1];
		}

		// Only if ratio is locked
		if ( dialog.lockRatio )
		{
			
			if ( this.id == 'height' )
			{
				if ( value && value != '0' )
					value = Math.round( CKEDITOR.config.streamingPlayer.width * ( value  / CKEDITOR.config.streamingPlayer.height ) );
				if ( !isNaN( value ) )
					dialog.setValueOf( 'info', 'width', value );
			}
			else		//this.id = txtWidth.
			{
				if ( value && value != '0' )
					value = Math.round( CKEDITOR.config.streamingPlayer.height * ( value  / CKEDITOR.config.streamingPlayer.width ) );
				if ( !isNaN( value ) )
					dialog.setValueOf( 'info', 'height', value );
			}
			
		}
    	};

	var switchLockRatio = function( dialog, value )
	{
		var ratioButton = CKEDITOR.document.getById( 'btnLockSizes' );

		if ( value == 'check' )			// Check image ratio and original image ratio.
			{
				var width = dialog.getValueOf( 'info', 'width' ),
					height = dialog.getValueOf( 'info', 'height' ),
					originalRatio = CKEDITOR.config.streamingPlayer.width * 1000 / CKEDITOR.config.streamingPlayer.height,
					thisRatio = width * 1000 / height;
				dialog.lockRatio  = false;		// Default: unlock ratio

				if ( !width && !height )
					dialog.lockRatio = true;
				else if ( !isNaN( originalRatio ) && !isNaN( thisRatio ) )
				{
					if ( Math.round( originalRatio ) == Math.round( thisRatio ) )
						dialog.lockRatio = true;
				}
			}
			else if ( value != undefined )
				dialog.lockRatio = value;
			else
				dialog.lockRatio = !dialog.lockRatio;
		
		if ( dialog.lockRatio )
			ratioButton.removeClass( 'cke_btn_unlocked' );
		else
			ratioButton.addClass( 'cke_btn_unlocked' );

		var lang = dialog._.editor.lang.streamingPlayer,
			label =  lang[  dialog.lockRatio ? 'unlockRatio' : 'lockRatio' ];

		ratioButton.setAttribute( 'title', label );
		ratioButton.getFirst().setText( label );

		return dialog.lockRatio;
	};

	var resetSize = function( dialog )
	{
		
		dialog.setValueOf( 'info', 'width', CKEDITOR.config.streamingPlayer.width );
		dialog.setValueOf( 'info', 'height', CKEDITOR.config.streamingPlayer.height );
		
	};

    function loadValue( objectNode, embedNode, paramMap )
    {
        var attributes = attributesMap[ this.id ];
        if ( !attributes )
            return;

        var isCheckbox = ( this instanceof CKEDITOR.ui.dialog.checkbox );
        for ( var i = 0 ; i < attributes.length ; i++ )
        {
            var attrDef = attributes[ i ];
            switch ( attrDef.type )
            {
                case ATTRTYPE_OBJECT:
                    if ( !objectNode )
                        continue;
                    if ( objectNode.getAttribute( attrDef.name ) !== null )
                    {
                        var value = objectNode.getAttribute( attrDef.name );
                        if ( isCheckbox )
                            this.setValue( value.toLowerCase() == 'true' );
                        else
                            //console.log(attrDef.name);
                            this.setValue( value );
                        return;
                    }
                    else if ( isCheckbox )
                        this.setValue( !!attrDef[ 'default' ] );
                    break;
                case ATTRTYPE_PARAM:
                    if ( !objectNode )
                        continue;
                    if ( attrDef.name in paramMap )
                    {
                        value = paramMap[ attrDef.name ];
                        if ( isCheckbox )
                            this.setValue( value.toLowerCase() == 'true' );
                        else
                            console.log(attrDef.name);
                            this.setValue( value );
                        return;
                    }
                    else if ( isCheckbox )
                        this.setValue( !!attrDef[ 'default' ] );
                    break;
                case ATTRTYPE_EMBED:
                    if ( !embedNode )
                        continue;
                    if ( embedNode.getAttribute( attrDef.name ) )
                    {
                        value = embedNode.getAttribute( attrDef.name );
                        if ( isCheckbox )
                            this.setValue( value.toLowerCase() == 'true' );
                        else
                            if(attrDef.name == 'flashvars')
                            {
                                temp = value.split('"');
                                this.setValue(temp[5]);
                            }
                            else
                            {
                                this.setValue( value );
                            }
                        return;
                    }
                    else if ( isCheckbox )
                        this.setValue( !!attrDef[ 'default' ] );
            }
        }
    }

    function commitValue( objectNode, embedNode, paramMap )
    {
        var attributes = attributesMap[ this.id ],
            dialog = this.getDialog();
        if ( !attributes )
            return;

        var isRemove = ( this.getValue() === '' ),
            isCheckbox = ( this instanceof CKEDITOR.ui.dialog.checkbox );

        for ( var i = 0 ; i < attributes.length ; i++ )
        {
            var attrDef = attributes[i];
            switch ( attrDef.type )
            {
                case ATTRTYPE_OBJECT:
                    if ( !objectNode )
                        continue;
                    var value = this.getValue();
                    if ( isRemove )
                        objectNode.removeAttribute( attrDef.name );
                    else
                        if(attrDef.name == 'flashvars')
                        {
                            value = unescape(value);
                            value = 'config={"clip":{"url":"' + escape( value ) + '", "autoPlay":'+ dialog.getValueOf('properties', 'play') +'}'+ CKEDITOR.config.streamingPlayer.extraFlashVars +'}';
                            objectNode.setAttribute(attrDef.name, value);
                        }
                        else
                        {
                            objectNode.setAttribute( attrDef.name, value );
                        }
                    break;
                case ATTRTYPE_PARAM:
                    if ( !objectNode )
                        continue;
                    value = this.getValue();
                    if ( isRemove )
                    {
                        if ( attrDef.name in paramMap )
                            paramMap[ attrDef.name ].remove();
                    }
                    else
                    {
                        if ( attrDef.name in paramMap )
                            if(attrDef.name == 'flashvars')
                            {
                                value = unescape(value);
                                value = escape( value ) ;
                                paramMap[ attrDef.name ].setAttribute( 'value', value );
                            }
                            else
                            {
                                paramMap[ attrDef.name ].setAttribute( 'value', value );
                            }
                        else
                        {
                            var param = CKEDITOR.dom.element.createFromHtml( '<cke:param></cke:param>', objectNode.getDocument() );
                            param.setAttributes( { name : attrDef.name, value : value } );
                            if ( objectNode.getChildCount() < 1 )
                                param.appendTo( objectNode );
                            else
                                param.insertBefore( objectNode.getFirst() );
                        }
                    }
                    break;
                case ATTRTYPE_EMBED:
                    if ( !embedNode )
                        continue;
                    value = this.getValue();
                    if ( isRemove || isCheckbox && value === attrDef[ 'default' ])
                        embedNode.removeAttribute( attrDef.name );
                    else
                        if(attrDef.name == 'flashvars')
                        {
                            value = unescape(value);
                            value = 'config={"clip":{"url":"' + escape( value ) + '", "autoPlay":'+ dialog.getValueOf('properties', 'play') +'}' + CKEDITOR.config.streamingPlayer.extraFlashVars +'}';
                            embedNode.setAttribute( attrDef.name, value );
                        }
                        else
                        {
                            embedNode.setAttribute( attrDef.name, value );
                        }
            }
        }
    }

    CKEDITOR.dialog.add( 'streamingPlayer', function( editor )
    {
        var makeObjectTag = !editor.config.flashEmbedTagOnly,
            makeEmbedTag = editor.config.flashAddEmbedTag || editor.config.flashEmbedTagOnly;

        var previewPreloader,
            previewAreaHtml = '<div>' + CKEDITOR.tools.htmlEncode( editor.lang.common.preview ) +'<br>' +
            '<div id="FlashPreviewLoader" style="display:none"><div class="loading">&nbsp;</div></div>' +
            '<div id="FlashPreviewBox"></div></div>';

        return {
            title : editor.lang.streamingPlayer.title,
            minWidth : 420,
            minHeight : 310,
            onShow : function()
            {
                // Clear previously saved elements.
                this.fakeImage = this.objectNode = this.embedNode = null;
                previewPreloader = new CKEDITOR.dom.element( 'embeded', editor.document );

                // Try to detect any embed or object tag that has Flash parameters.
                var fakeImage = this.getSelectedElement();
                if ( fakeImage && fakeImage.getAttribute( '_cke_real_element_type' ) && fakeImage.getAttribute( '_cke_real_element_type' ) == 'flash' )
                {
                    this.fakeImage = fakeImage;

                    var realElement = editor.restoreRealElement( fakeImage ),
                        objectNode = null, embedNode = null, paramMap = {};
                    if ( realElement.getName() == 'cke:object' )
                    {
                        objectNode = realElement;
                        var embedList = objectNode.getElementsByTag( 'embed', 'cke' );
                        if ( embedList.count() > 0 )
                            embedNode = embedList.getItem( 0 );
                        var paramList = objectNode.getElementsByTag( 'param', 'cke' );
                        for ( var i = 0, length = paramList.count() ; i < length ; i++ )
                        {
                            var item = paramList.getItem( i ),
                                name = item.getAttribute( 'name' ),
                                value = item.getAttribute( 'value' );
                            paramMap[ name ] = value;
                        }
                    }
                    else if ( realElement.getName() == 'cke:embed' )
                        embedNode = realElement;

                    this.objectNode = objectNode;
                    this.embedNode = embedNode;

                    this.setupContent( objectNode, embedNode, paramMap, fakeImage );
                }
            },
            onOk : function()
            {
                // If there's no selected object or embed, create one. Otherwise, reuse the
                // selected object and embed nodes.
                var objectNode = null,
                    embedNode = null,
                    paramMap = null;
                if ( !this.fakeImage )
                {
                    if ( makeObjectTag )
                    {
                        objectNode = CKEDITOR.dom.element.createFromHtml( '<cke:object></cke:object>', editor.document );
                        var attributes = {
                            classid : 'clsid:d27cdb6e-ae6d-11cf-96b8-444553540000',
                            movie : CKEDITOR.config.streamingPlayer.movie,
                            id : 'flowplayer'
                                
                        };
                        objectNode.setAttributes( attributes );
                    }
                    if ( makeEmbedTag )
                    {
                        embedNode = CKEDITOR.dom.element.createFromHtml( '<cke:embed></cke:embed>', editor.document );
                        embedNode.setAttributes(
                            {
                                type : 'application/x-shockwave-flash',
                                src : CKEDITOR.config.streamingPlayer.movie
                            } );
                        if ( objectNode )
                            embedNode.appendTo( objectNode );
                    }
                }
                else
                {
                    objectNode = this.objectNode;
                    embedNode = this.embedNode;
                }

                // Produce the paramMap if there's an object tag.
                if ( objectNode )
                {
                    paramMap = {};
                    var paramList = objectNode.getElementsByTag( 'param', 'cke' );
                    for ( var i = 0, length = paramList.count() ; i < length ; i++ )
                        paramMap[ paramList.getItem( i ).getAttribute( 'name' ) ] = paramList.getItem( i );
                }

                // A subset of the specified attributes/styles
                // should also be applied on the fake element to
                // have better visual effect. (#5240)
                var extraStyles = {}, extraAttributes = {};
                this.commitContent( objectNode, embedNode, paramMap, extraStyles, extraAttributes );

                // Refresh the fake image.
                var newFakeImage = editor.createFakeElement( objectNode || embedNode, 'cke_flash', 'flash', true );
                newFakeImage.setAttributes( extraAttributes );
                newFakeImage.setStyles( extraStyles );
                if ( this.fakeImage )
                {
                    newFakeImage.replace( this.fakeImage );
                    editor.getSelection().selectElement( newFakeImage );
                }
                else
                    editor.insertElement( newFakeImage );
            },

            onHide : function()
            {
                if ( this.preview )
                    this.preview.setHtml('');
            },

            contents : [
                {
                    id : 'info',
                    label : editor.lang.common.generalTab,
                    accessKey : 'I',
                    elements :
                    [
                        {
                            type : 'vbox',
                            padding : 0,
                            children :
                            [
                                {
                                    type : 'hbox',
                                    widths : [ '280px', '110px' ],
                                    align : 'right',
                                    children :
                                    [
                                        {
                                            id : 'flashvars',
                                            type : 'text',
                                            label : editor.lang.common.url,
                                            required : true,
                                            validate : CKEDITOR.dialog.validate.notEmpty( editor.lang.flash.validateSrc ),
                                            setup : loadValue,
                                            commit : commitValue,
                                            onLoad : function()
                                            {
                                                var dialog = this.getDialog(),
                                                updatePreview = function( flashvars ){
                                                    //Query the preloader to figure out the url impacted by based href.
                                                    previewPreloader.setAttribute( 'flashvars', flashvars );
                                                    dialog.preview.setHtml( '<embed height="100%" width="100%" src="'
                                                        + CKEDITOR.tools.htmlEncode( previewPreloader.getAttribute( 'flashvars' ) )
                                                        + '" type="application/x-shockwave-flash"></embed>' );
                                                };
                                                
                                                // Preview element
                                                dialog.preview = dialog.getContentElement( 'info', 'preview' ).getElement().getChild( 3 );

                                                // Sync on inital value loaded.
                                                this.on( 'change', function( evt ){

                                                        if ( evt.data && evt.data.value )
                                                            updatePreview( evt.data.value );
                                                    } );
                                                // Sync when input value changed.
                                                this.getInputElement().on( 'change', function( evt ){

                                                    updatePreview( this.getValue() );
                                                }, this );
                                            }
                                        },
                                        {
                                            type : 'button',
                                            id : 'browse',
                                            filebrowser : 'info:flashvars',
                                            hidden : true,
                                            // v-align with the 'src' field.
                                            // TODO: We need something better than a fixed size here.
                                            style : 'display:inline-block;margin-top:10px;',
                                            label : editor.lang.common.browseServer
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            type : 'hbox',
                            widths : [ '50%', '25%', '25%', '25%' ],
                            children :
                            [
				{
					type : 'hbox',
					widths : [ '70%', '30%'],
					children :
					[
						{
							type : 'vbox',
							padding : 1,
							children :
							[
								{
                                	                                type : 'text',
                                    					id : 'width',
					                                style : 'width:80px',
                                    					default: CKEDITOR.config.streamingPlayer.width ,
									labelLayout : 'horizontal',
					                                label : editor.lang.flash.width,
                                    					validate : CKEDITOR.dialog.validate.integer( editor.lang.flash.validateWidth ),
									onKeyUp : onSizeChange,
									onChange : function() {},
                                    					setup : function( objectNode, embedNode, paramMap, fakeImage )
                                    					{
                                        					loadValue.apply( this, arguments );
                                        					if ( fakeImage )
                                        					{
                                            						var fakeImageWidth = parseInt( fakeImage.$.style.width, 10 );
                                            						if ( !isNaN( fakeImageWidth ) )
                                                						this.setValue( fakeImageWidth );
                                        					}
                                    					},
                                    					commit : function( objectNode, embedNode, paramMap, extraStyles )
                                    					{
                                        					commitValue.apply( this, arguments );
                                        					if ( this.getValue() )
                                            						extraStyles.width = this.getValue() + 'px';
                                    					}
                                				},
                                				{
                                    					type : 'text',
                                    					id : 'height',
                                   					style : 'width:80px',
									labelLayout : 'horizontal',
                                    					default: CKEDITOR.config.streamingPlayer.height ,
                                    					label : editor.lang.flash.height,
                                    					validate : CKEDITOR.dialog.validate.integer( editor.lang.flash.validateHeight ),
									onKeyUp : onSizeChange,
									onChange : function() {},
                                    					setup : function( objectNode, embedNode, paramMap, fakeImage )
                                    					{
                                        					loadValue.apply( this, arguments );
                                        					if ( fakeImage )
                                        					{
                                            						var fakeImageHeight = parseInt( fakeImage.$.style.height, 10 );
                                            						if ( !isNaN( fakeImageHeight ) )
                                                						this.setValue( fakeImageHeight );
                                        					}
                                    					},
                                    					commit : function( objectNode, embedNode, paramMap, extraStyles )
                                    					{
                                        					commitValue.apply( this, arguments );
                                        					if ( this.getValue() )
                                            						extraStyles.height = this.getValue() + 'px';
                                    					}
                                				},
							]
						},
						{
							type : 'html',
							style : 'margin-top:10px;width:40px;height:40px;',
							onLoad : function()
							{
								// Activate Reset button
								var resetButton = CKEDITOR.document.getById( 'btnResetSize' ),
								ratioButton = CKEDITOR.document.getById( 'btnLockSizes' );
								if ( resetButton )
								{
									resetButton.on( 'click', function(evt)
									{
										resetSize( this );
										evt.data.preventDefault();
									}, this.getDialog() );

									resetButton.on( 'mouseover', function()
									{
										this.addClass( 'cke_btn_over' );
									}, resetButton );

									resetButton.on( 'mouseout', function()
									{
										this.removeClass( 'cke_btn_over' );
									}, resetButton );
								}
								// Activate (Un)LockRatio button
								if ( ratioButton )
								{
									ratioButton.on( 'click', function(evt)
									{
										var locked = switchLockRatio( this ),
										width = this.getValueOf( 'info', 'width' );
										if ( width )
										{
											var height = CKEDITOR.config.streamingPlayer.height / CKEDITOR.config.streamingPlayer.width * width;
											if ( !isNaN( height ) )
											{
												this.setValueOf( 'info', 'height', Math.round( height ) );
												//updatePreview( this );
											}
										}
										evt.data.preventDefault();
									}, this.getDialog() );
									ratioButton.on( 'mouseover', function()
									{
										this.addClass( 'cke_btn_over' );
									}, ratioButton );
									ratioButton.on( 'mouseout', function()
									{
										this.removeClass( 'cke_btn_over' );
									}, ratioButton );
								}
							},
							html : '<div>'+
							'<a href="javascript:void(0)" tabindex="-1" title="' + editor.lang.streamingPlayer.unlockRatio +
							'" class="cke_btn_locked" id="btnLockSizes" role="button"><span class="cke_label">' + editor.lang.streamingPlayer.unlockRatio + '</span></a>' +
							'<a href="javascript:void(0)" tabindex="-1" title="' + editor.lang.streamingPlayer.resetSize +
							'" class="cke_btn_reset" id="btnResetSize" role="button"><span class="cke_label">' + editor.lang.streamingPlayer.resetSize + '</span></a>'+
							'</div>'
						}
					]
				},
                                {
                                    type : 'text',
                                    id : 'hSpace',
                                    style : 'width:95px',
                                    label : editor.lang.flash.hSpace,
                                    validate : CKEDITOR.dialog.validate.integer( editor.lang.flash.validateHSpace ),
                                    setup : loadValue,
                                    commit : commitValue
                                },
                                {
                                    type : 'text',
                                    id : 'vSpace',
                                    style : 'width:95px',
                                    label : editor.lang.flash.vSpace,
                                    validate : CKEDITOR.dialog.validate.integer( editor.lang.flash.validateVSpace ),
                                    setup : loadValue,
                                    commit : commitValue
                                }
                            ]
                        },
                        {
			    type : 'vbox',
                            children :
                            [
                                {
                                    type : 'html',
                                    id : 'preview',
                                    style : 'width:95%;',
                                    html : previewAreaHtml
                                }
                            ]
                        }
                    ]
                },
                {
                    id : 'Upload',
                    hidden : true,
                    filebrowser : 'uploadButton',
                    label : editor.lang.common.upload,
                    elements :
                    [
                        {
                            type : 'file',
                            id : 'upload',
                            label : editor.lang.common.upload,
                            size : 38
                        },
                        {
                            type : 'fileButton',
                            id : 'uploadButton',
                            label : editor.lang.common.uploadSubmit,
                            filebrowser : 'info:src',
                            'for' : [ 'Upload', 'upload' ]
                        }
                    ]
                },
                {
                    id : 'properties',
                    label : editor.lang.flash.propertiesTab,
                    elements :
                    [
                        {
                            type : 'hbox',
                            widths : [ '50%', '50%' ],
                            children :
                            [
                                {
                                    id : 'scale',
                                    type : 'select',
                                    label : editor.lang.flash.scale,
                                    'default' : '',
                                    style : 'width : 100%;',
                                    items :
                                    [
                                        [ editor.lang.common.notSet , ''],
                                        [ editor.lang.flash.scaleAll, 'showall' ],
                                        [ editor.lang.flash.scaleNoBorder, 'noborder' ],
                                        [ editor.lang.flash.scaleFit, 'exactfit' ]
                                    ],
                                    setup : loadValue,
                                    commit : commitValue
                                },
                                {
                                    id : 'allowScriptAccess',
                                    type : 'select',
                                    label : editor.lang.flash.access,
                                    'default' : '',
                                    style : 'width : 100%;',
                                    items :
                                    [
                                        [ editor.lang.common.notSet , ''],
                                        [ editor.lang.flash.accessAlways, 'always' ],
                                        [ editor.lang.flash.accessSameDomain, 'samedomain' ],
                                        [ editor.lang.flash.accessNever, 'never' ]
                                    ],
                                    setup : loadValue,
                                    commit : commitValue
                                }
                            ]
                        },
                        {
                            type : 'hbox',
                            widths : [ '50%', '50%' ],
                            children :
                            [
                                {
                                    id : 'wmode',
                                    type : 'select',
                                    label : editor.lang.flash.windowMode,
                                    'default' : '',
                                    style : 'width : 100%;',
                                    items :
                                    [
                                        [ editor.lang.common.notSet , '' ],
                                        [ editor.lang.flash.windowModeWindow, 'window' ],
                                        [ editor.lang.flash.windowModeOpaque, 'opaque' ],
                                        [ editor.lang.flash.windowModeTransparent, 'transparent' ]
                                    ],
                                    setup : loadValue,
                                    commit : commitValue
                                },
                                {
                                    id : 'quality',
                                    type : 'select',
                                    label : editor.lang.flash.quality,
                                    'default' : 'high',
                                    style : 'width : 100%;',
                                    items :
                                    [
                                        [ editor.lang.common.notSet , '' ],
                                        [ editor.lang.flash.qualityBest, 'best' ],
                                        [ editor.lang.flash.qualityHigh, 'high' ],
                                        [ editor.lang.flash.qualityAutoHigh, 'autohigh' ],
                                        [ editor.lang.flash.qualityMedium, 'medium' ],
                                        [ editor.lang.flash.qualityAutoLow, 'autolow' ],
                                        [ editor.lang.flash.qualityLow, 'low' ]
                                    ],
                                    setup : loadValue,
                                    commit : commitValue
                                }
                            ]
                        },
                        {
                            type : 'hbox',
                            widths : [ '50%', '50%' ],
                            children :
                            [
                                {
                                    id : 'align',
                                    type : 'select',
                                    label : editor.lang.flash.align,
                                    'default' : '',
                                    style : 'width : 100%;',
                                    items :
                                    [
                                        [ editor.lang.common.notSet , ''],
                                        [ editor.lang.flash.alignLeft , 'left'],
                                        [ editor.lang.flash.alignAbsBottom , 'absBottom'],
                                        [ editor.lang.flash.alignAbsMiddle , 'absMiddle'],
                                        [ editor.lang.flash.alignBaseline , 'baseline'],
                                        [ editor.lang.flash.alignBottom , 'bottom'],
                                        [ editor.lang.flash.alignMiddle , 'middle'],
                                        [ editor.lang.flash.alignRight , 'right'],
                                        [ editor.lang.flash.alignTextTop , 'textTop'],
                                        [ editor.lang.flash.alignTop , 'top']
                                    ],
                                    setup : loadValue,
                                    commit : function( objectNode, embedNode, paramMap, extraStyles, extraAttributes )
                                    {
                                        var value = this.getValue();
                                        commitValue.apply( this, arguments );
                                        value && ( extraAttributes.align = value );
                                    }
                                },
                                {
                                    type : 'html',
                                    html : '<div></div>'
                                }
                            ]
                        },
                        {
                            type : 'fieldset',
                            label : CKEDITOR.tools.htmlEncode( editor.lang.flash.flashvars ),
                            children :
                            [
                                {
                                    type : 'vbox',
                                    padding : 0,
                                    children :
                                    [
                                        {
                                            type : 'checkbox',
                                            id : 'menu',
                                            label : editor.lang.flash.chkMenu,
                                            'default' : true,
                                            setup : loadValue,
                                            commit : commitValue
                                        },
                                        {
                                            type : 'checkbox',
                                            id : 'play',
                                            label : editor.lang.flash.chkPlay,
                                            'default' : false,
                                            setup : loadValue,
                                            commit : commitValue
                                        },
                                        {
                                            type : 'checkbox',
                                            id : 'loop',
                                            label : editor.lang.flash.chkLoop,
                                            'default' : false,
                                            setup : loadValue,
                                            commit : commitValue
                                        },
                                        {
                                            type : 'checkbox',
                                            id : 'allowfullscreen',
                                            label : editor.lang.flash.chkFull,
                                            'default' : true,
                                            setup : loadValue,
                                            commit : commitValue
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                {
                    id : 'advanced',
                    label : editor.lang.common.advancedTab,
                    elements :
                    [
                        {
                            type : 'hbox',
                            widths : [ '45%', '55%' ],
                            children :
                            [
                                {
                                    type : 'text',
                                    id : 'id',
                                    label : editor.lang.common.id,
                                    setup : loadValue,
                                    commit : commitValue
                                },
                                {
                                    type : 'text',
                                    id : 'title',
                                    label : editor.lang.common.advisoryTitle,
                                    setup : loadValue,
                                    commit : commitValue
                                }
                            ]
                        },
                        {
                            type : 'hbox',
                            widths : [ '45%', '55%' ],
                            children :
                            [
                                {
                                    type : 'text',
                                    id : 'bgcolor',
				    				default : '#000000',
                                    label : editor.lang.flash.bgcolor,
                                    setup : loadValue,
                                    commit : commitValue
                                },
                                {
                                    type : 'text',
                                    id : 'class',
                                    label : editor.lang.common.cssClass,
                                    setup : loadValue,
                                    commit : commitValue
                                }
                            ]
                        },
                        {
                            type : 'text',
                            id : 'style',
                            label : editor.lang.common.cssStyle,
                            setup : loadValue,
                            commit : commitValue
                        }
                    ]
                }
            ]
        };
    } );
})();
