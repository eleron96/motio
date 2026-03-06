<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=false displayMessage=false; section>
    <#if section = "header">
        ${msg("confirmLinkIdpTitle")}
    <#elseif section = "form">
        <#assign timelineExistingEmail = brokerContext.username!"" />
        <div class="timeline-idp-link-stack">
            <div class="timeline-idp-link-warning" role="alert">
                <#if timelineExistingEmail?has_content>
                    ${msg("timelineIdpAccountExistsPrompt", timelineExistingEmail)}
                <#else>
                    ${msg("timelineIdpAccountExistsPromptFallback")}
                </#if>
            </div>

            <div class="timeline-idp-link-summary">
                ${msg("timelineIdpConfirmHint", idpDisplayName)}
            </div>

            <form id="kc-register-form" class="timeline-idp-link-form timeline-idp-link-form-compact" action="${url.loginAction}" method="post">
                <a
                    id="timeline-link-account-back"
                    class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!} timeline-idp-choice timeline-idp-choice-secondary timeline-idp-choice-link"
                    href="${url.loginRestartFlowUrl}"
                >
                    <span class="timeline-idp-choice-title">${msg("timelineIdpBackToAnotherMethod")}</span>
                </a>

                <button
                    type="submit"
                    class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!} timeline-idp-choice"
                    name="submitAction"
                    id="linkAccount"
                    value="linkAccount"
                >
                    <span class="timeline-idp-choice-title">${msg("confirmLinkIdpContinue", idpDisplayName)}</span>
                </button>
            </form>
        </div>
    </#if>
</@layout.registrationLayout>
