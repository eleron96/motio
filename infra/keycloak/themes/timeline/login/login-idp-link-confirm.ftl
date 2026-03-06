<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=false; section>
    <#if section = "header">
        ${msg("confirmLinkIdpTitle")}
    <#elseif section = "form">
        <form id="kc-register-form" class="timeline-idp-link-form" action="${url.loginAction}" method="post">
            <button
                type="submit"
                class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!} timeline-idp-choice timeline-idp-choice-secondary"
                name="submitAction"
                id="updateProfile"
                value="updateProfile"
            >
                <span class="timeline-idp-choice-title">${msg("confirmLinkIdpReviewProfile")}</span>
            </button>

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
    </#if>
</@layout.registrationLayout>
