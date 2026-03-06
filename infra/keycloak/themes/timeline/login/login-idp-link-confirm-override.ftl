<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=false; section>
    <#if section = "header">
        ${msg("confirmOverrideIdpTitle")}
    <#elseif section = "form">
        <div class="timeline-idp-link-summary">
            ${msg("timelineIdpOverrideHint")}
            <a id="loginRestartLink" href="${url.loginRestartFlowUrl}">${msg("doClickHere")}</a>
        </div>

        <form id="kc-register-form" class="timeline-idp-link-form" action="${url.loginAction}" method="post">
            <button
                type="submit"
                class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!} timeline-idp-choice"
                name="submitAction"
                id="confirmOverride"
                value="confirmOverride"
            >
                <span class="timeline-idp-choice-title">${msg("confirmOverrideIdpContinue", idpDisplayName)}</span>
                <span class="timeline-idp-choice-description">${msg("timelineIdpContinueLinkDescription", idpDisplayName)}</span>
            </button>
        </form>
    </#if>
</@layout.registrationLayout>
