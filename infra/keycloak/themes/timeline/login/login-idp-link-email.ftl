<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=false; section>
    <#if section = "header">
        ${msg("emailLinkIdpTitle", idpDisplayName)}
    <#elseif section = "form">
        <div class="timeline-idp-link-summary">
            ${msg("emailLinkIdp1", idpDisplayName, brokerContext.username, realm.displayName)}
        </div>

        <div class="timeline-idp-link-menu">
            <a class="timeline-idp-link-item" href="${url.loginAction}">
                <span class="timeline-idp-link-item-title">${msg("emailLinkIdp2")}</span>
                <span class="timeline-idp-link-item-description">${msg("emailLinkIdp3")}</span>
            </a>
            <a class="timeline-idp-link-item" href="${url.loginAction}">
                <span class="timeline-idp-link-item-title">${msg("emailLinkIdp4")}</span>
                <span class="timeline-idp-link-item-description">${msg("emailLinkIdp5")}</span>
            </a>
        </div>
    </#if>
</@layout.registrationLayout>
